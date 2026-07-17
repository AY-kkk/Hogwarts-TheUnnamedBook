export const PRIVACY_POLICY_VERSION = '2026-07-17';

function requiredProductionValue(
  name: string,
  configuredValue: string | undefined,
  developmentValue: string,
): string {
  const value = configuredValue?.trim();
  if (value) return value;
  if (import.meta.env.DEV) return developmentValue;
  throw new Error(`${name} must be configured for production`);
}

export const LEGAL_CONFIG = {
  operatorName: requiredProductionValue(
    'VITE_OPERATOR_NAME',
    import.meta.env.VITE_OPERATOR_NAME,
    '本地开发环境（未配置正式运营主体）',
  ),
  privacyContact: requiredProductionValue(
    'VITE_PRIVACY_CONTACT',
    import.meta.env.VITE_PRIVACY_CONTACT,
    '本地开发环境未配置隐私联系方式',
  ),
  modelDataDestinations: requiredProductionValue(
    'VITE_MODEL_DATA_DESTINATIONS',
    import.meta.env.VITE_MODEL_DATA_DESTINATIONS,
    '当前配置的大模型服务商',
  ),
};
