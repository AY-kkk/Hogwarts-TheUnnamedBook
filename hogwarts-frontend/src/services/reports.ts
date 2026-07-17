import { db, type Log } from '../lib/db';
import { requirePrivacyConsent } from './privacy';
import { requireAgeAcknowledgement } from './safety';
import { apiFetch } from './session';

export const REPORT_CATEGORIES = [
  { value: 'unsafe', label: '危险或不当内容' },
  { value: 'minor_safety', label: '未成年人保护' },
  { value: 'privacy', label: '隐私或个人信息' },
  { value: 'copyright', label: '授权范围或内容权利' },
  { value: 'other', label: '其他' },
] as const;

export async function submitContentReport(
  characterUuid: string,
  log: Log,
  category: string,
  note: string
): Promise<string> {
  if (!log.id) throw new Error('无法为未保存的内容提交举报');
  await requireAgeAcknowledgement();
  await requirePrivacyConsent();
  const response = await apiFetch('/api/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Character-ID': characterUuid,
    },
    body: JSON.stringify({
      character_id: characterUuid,
      log_id: log.id,
      request_id: log.generation?.request_id,
      category,
      note: note.trim(),
    }),
  });
  if (!response.ok) throw new Error(`举报提交失败（${response.status}）`);
  const data = (await response.json()) as { report_id?: string };
  if (!data.report_id) throw new Error('举报系统未返回受理编号');
  await db.settings.put({
    key: `contentReport:${data.report_id}`,
    value: {
      reportId: data.report_id,
      characterUuid,
      logId: log.id,
      requestId: log.generation?.request_id,
      category,
      submittedAt: Date.now(),
      status: 'accepted',
    },
  });
  return data.report_id;
}
