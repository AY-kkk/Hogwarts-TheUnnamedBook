import { LEGAL_CONFIG, PRIVACY_POLICY_VERSION } from '../config/legal';
import { db } from '../lib/db';

const PRIVACY_CONSENT_KEY = 'privacyConsent';

export interface PrivacyConsentRecord {
  accepted: true;
  acceptedAt: number;
  policyVersion: string;
  operatorName: string;
  modelDataDestinations: string;
}

export class PrivacyConsentRequiredError extends Error {
  constructor() {
    super('请先阅读并同意隐私与 AI 数据处理说明');
    this.name = 'PrivacyConsentRequiredError';
  }
}

export async function getPrivacyConsent(): Promise<PrivacyConsentRecord | null> {
  const row = await db.settings.get(PRIVACY_CONSENT_KEY);
  const value = row?.value;
  if (!value || typeof value !== 'object') return null;

  const consent = value as Partial<PrivacyConsentRecord>;
  if (
    consent.accepted !== true ||
    consent.policyVersion !== PRIVACY_POLICY_VERSION ||
    typeof consent.acceptedAt !== 'number'
  ) {
    return null;
  }

  return consent as PrivacyConsentRecord;
}

export async function hasPrivacyConsent(): Promise<boolean> {
  return (await getPrivacyConsent()) !== null;
}

export async function acceptPrivacyConsent(): Promise<void> {
  const consent: PrivacyConsentRecord = {
    accepted: true,
    acceptedAt: Date.now(),
    policyVersion: PRIVACY_POLICY_VERSION,
    operatorName: LEGAL_CONFIG.operatorName,
    modelDataDestinations: LEGAL_CONFIG.modelDataDestinations,
  };
  await db.settings.put({ key: PRIVACY_CONSENT_KEY, value: consent });
}

export async function requirePrivacyConsent(): Promise<void> {
  if (!(await hasPrivacyConsent())) throw new PrivacyConsentRequiredError();
}

export async function revokePrivacyConsent(): Promise<void> {
  await db.settings.delete(PRIVACY_CONSENT_KEY);
}

function removeSecretSettings<T extends { key: string }>(settings: T[]): T[] {
  return settings.filter(({ key }) => !/(api[_-]?key|token|secret|password)/i.test(key));
}

export async function downloadLocalData(): Promise<void> {
  const [characters, logs, memories, worldLog, settings] = await Promise.all([
    db.character.toArray(),
    db.logs.toArray(),
    db.memories.toArray(),
    db.world_log.toArray(),
    db.settings.toArray(),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    generatedContentNotice: '故事日志中 type=ai 的条目为 AI 生成内容，可能包含错误或不当信息。',
    data: {
      characters,
      logs,
      memories,
      worldLog,
      settings: removeSecretSettings(settings),
    },
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `unnamed-book-data-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function deleteAllLocalData(): Promise<void> {
  await db.delete();
}
