const DEV_API_BASE_URL = 'http://localhost:3000';

function getApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, '');

  if (import.meta.env.DEV) return DEV_API_BASE_URL;

  throw new Error('VITE_API_BASE_URL must be configured for production builds');
}

export function apiUrl(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(`API path must start with "/": ${path}`);
  }

  return `${getApiBaseUrl()}${path}`;
}
