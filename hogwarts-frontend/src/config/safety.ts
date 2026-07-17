export const SAFETY_NOTICE_VERSION = '2026-07-17';

function getMinimumAge(): number {
  const configured = import.meta.env.VITE_MINIMUM_AGE?.trim();
  if (!configured && import.meta.env.PROD) {
    throw new Error('VITE_MINIMUM_AGE must be configured for production builds');
  }
  const age = Number(configured || '16');
  if (!Number.isInteger(age) || age < 13 || age > 18) {
    throw new Error('VITE_MINIMUM_AGE must be an integer between 13 and 18');
  }
  return age;
}

export const MINIMUM_AGE = getMinimumAge();
