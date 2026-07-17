import { MINIMUM_AGE, SAFETY_NOTICE_VERSION } from '../config/safety';
import { db } from '../lib/db';

const AGE_ACKNOWLEDGEMENT_KEY = 'ageAcknowledgement';

interface AgeAcknowledgement {
  accepted: true;
  acceptedAt: number;
  minimumAge: number;
  noticeVersion: string;
}

export async function hasAgeAcknowledgement(): Promise<boolean> {
  const value = (await db.settings.get(AGE_ACKNOWLEDGEMENT_KEY))?.value as Partial<AgeAcknowledgement> | undefined;
  return Boolean(
    value?.accepted === true
    && value.minimumAge === MINIMUM_AGE
    && value.noticeVersion === SAFETY_NOTICE_VERSION
    && typeof value.acceptedAt === 'number'
  );
}

export async function acceptAgeAcknowledgement(): Promise<void> {
  const record: AgeAcknowledgement = {
    accepted: true,
    acceptedAt: Date.now(),
    minimumAge: MINIMUM_AGE,
    noticeVersion: SAFETY_NOTICE_VERSION,
  };
  await db.settings.put({ key: AGE_ACKNOWLEDGEMENT_KEY, value: record });
}

export async function requireAgeAcknowledgement(): Promise<void> {
  if (!(await hasAgeAcknowledgement())) {
    throw new Error('请先完成年龄与监护提示确认');
  }
}
