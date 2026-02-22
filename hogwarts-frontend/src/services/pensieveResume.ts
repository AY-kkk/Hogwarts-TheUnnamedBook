import { db, type Log } from '../lib/db';

export type PensieveResumeState = {
  baseLogId: number;
  resumeMarkerLogId: number;
  createdAt: number;
};

const getResumeKey = (characterUuid: string) => `pensieveResume:${characterUuid}`;

function isPensieveResumeState(value: unknown): value is PensieveResumeState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.baseLogId === 'number' &&
    Number.isFinite(v.baseLogId) &&
    typeof v.resumeMarkerLogId === 'number' &&
    Number.isFinite(v.resumeMarkerLogId) &&
    typeof v.createdAt === 'number' &&
    Number.isFinite(v.createdAt)
  );
}

export async function getPensieveResumeState(characterUuid: string): Promise<PensieveResumeState | null> {
  const row = await db.settings.get(getResumeKey(characterUuid));
  const value: unknown = row?.value;
  if (!isPensieveResumeState(value)) return null;

  const [baseLog, markerLog] = await Promise.all([
    db.logs.get(value.baseLogId),
    db.logs.get(value.resumeMarkerLogId)
  ]);
  const isValid =
    !!baseLog &&
    !!markerLog &&
    baseLog.characterUuid === characterUuid &&
    markerLog.characterUuid === characterUuid;
  if (!isValid) {
    await clearPensieveResumeState(characterUuid);
    return null;
  }
  return value;
}

export async function setPensieveResumeState(characterUuid: string, state: PensieveResumeState): Promise<void> {
  await db.settings.put({ key: getResumeKey(characterUuid), value: state });
}

export async function clearPensieveResumeState(characterUuid: string): Promise<void> {
  await db.settings.delete(getResumeKey(characterUuid));
}

export async function getActiveTimelineLogs(characterUuid: string): Promise<Log[]> {
  const state = await getPensieveResumeState(characterUuid);
  if (!state) {
    return await db.logs.where('characterUuid').equals(characterUuid).sortBy('id');
  }

  const [basePart, resumedPart] = await Promise.all([
    db.logs
      .where('characterUuid')
      .equals(characterUuid)
      .and((l) => typeof l.id === 'number' && l.id <= state.baseLogId)
      .toArray(),
    db.logs
      .where('characterUuid')
      .equals(characterUuid)
      .and((l) => typeof l.id === 'number' && l.id >= state.resumeMarkerLogId)
      .toArray()
  ]);

  return [...basePart, ...resumedPart].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

export async function startPensieveResumeFromLog(characterUuid: string, baseLogId: number): Promise<void> {
  const baseLog = await db.logs.get(baseLogId);
  if (!baseLog || baseLog.characterUuid !== characterUuid) {
    throw new Error('无效的记忆：找不到对应日志或角色不匹配');
  }

  const markerTurnId = Date.now();
  const markerContent =
    `*你从冥想盆中回到一段旧日回响，故事从此处分岔继续。*\\n\\n` +
    `*提示：冥想盆中的“后续记忆”不会被删除，但它们不再参与当前叙事。*`;

  const resumeMarkerLogId = await db.logs.add({
    turn_id: markerTurnId,
    content: markerContent,
    type: 'system',
    characterUuid,
    timestamp: markerTurnId
  });

  await setPensieveResumeState(characterUuid, {
    baseLogId,
    resumeMarkerLogId,
    createdAt: markerTurnId
  });
}
