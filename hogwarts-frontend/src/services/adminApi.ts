import { apiUrl } from '../config/api';

export type ProviderPreset = 'openai' | 'deepseek' | 'minimax' | 'glm' | 'custom';
export type UsageWindow = '24h' | '7d' | '30d';

export interface AdminSession {
  authenticated: boolean;
  username: string | null;
}

export interface AdminBootstrapStatus {
  registration_open: boolean;
}

export interface ModelProvider {
  id: string;
  name: string;
  preset: ProviderPreset;
  base_url: string;
  api_key_last4: string;
  has_api_key: boolean;
  models: string[];
  active_model: string | null;
  is_enabled: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProviderInput {
  name: string;
  preset: ProviderPreset;
  base_url: string;
  api_key: string;
  models: string[];
  is_enabled: boolean;
}

export type ProviderUpdateInput = Partial<ProviderInput>;

export interface ConnectionTestResult {
  ok: boolean;
  model: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
}

export interface UsageGroup {
  provider_name: string;
  model: string;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  success_rate: number;
  average_latency_ms: number;
  input_tokens: number;
  output_tokens: number;
}

export interface UsageSummary {
  window: UsageWindow;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  success_rate: number;
  average_latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  groups: UsageGroup[];
}

export interface AuditRecord {
  id: number;
  occurred_at: string;
  action: string;
  target_id: string | null;
  result: string;
}

export class AdminAuthenticationError extends Error {
  constructor() {
    super('管理员登录已失效，请重新登录');
    this.name = 'AdminAuthenticationError';
  }
}

async function getAdminError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      detail?: string | { message?: string; code?: string };
    };
    if (typeof payload.detail === 'string') return payload.detail;
    if (payload.detail?.message) return payload.detail.message;
  } catch {
    // The safe status fallback below is enough for non-JSON upstream errors.
  }
  return `管理请求失败（${response.status}）`;
}

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');

  const response = await fetch(apiUrl(`/api/admin${path}`), {
    ...init,
    credentials: 'include',
    headers,
  });
  if (response.status === 401) throw new AdminAuthenticationError();
  if (!response.ok) throw new Error(await getAdminError(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function adminLogin(username: string, password: string): Promise<void> {
  return adminRequest('/session', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function getAdminSession(): Promise<AdminSession> {
  return adminRequest('/session');
}

export function getAdminBootstrapStatus(): Promise<AdminBootstrapStatus> {
  return adminRequest('/bootstrap');
}

export function initializeAdmin(username: string, password: string): Promise<AdminSession> {
  return adminRequest('/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function adminLogout(): Promise<void> {
  return adminRequest('/session', { method: 'DELETE' });
}

export function listProviders(): Promise<ModelProvider[]> {
  return adminRequest('/providers');
}

export function createProvider(payload: ProviderInput): Promise<ModelProvider> {
  return adminRequest('/providers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateProvider(
  providerId: string,
  payload: ProviderUpdateInput,
): Promise<ModelProvider> {
  const safePayload = { ...payload };
  if (safePayload.api_key === '') delete safePayload.api_key;
  return adminRequest(`/providers/${encodeURIComponent(providerId)}`, {
    method: 'PATCH',
    body: JSON.stringify(safePayload),
  });
}

export function deleteProvider(providerId: string): Promise<void> {
  return adminRequest(`/providers/${encodeURIComponent(providerId)}`, {
    method: 'DELETE',
  });
}

export async function discoverModels(providerId: string): Promise<string[]> {
  const response = await adminRequest<{ models: string[] }>(
    `/providers/${encodeURIComponent(providerId)}/discover`,
    { method: 'POST' },
  );
  return response.models;
}

export function testProvider(
  providerId: string,
  model: string,
): Promise<ConnectionTestResult> {
  return adminRequest(`/providers/${encodeURIComponent(providerId)}/test`, {
    method: 'POST',
    body: JSON.stringify({ model }),
  });
}

export function activateProvider(providerId: string, model: string): Promise<ModelProvider> {
  return adminRequest(`/providers/${encodeURIComponent(providerId)}/activate`, {
    method: 'POST',
    body: JSON.stringify({ model }),
  });
}

export function getUsage(window: UsageWindow): Promise<UsageSummary> {
  return adminRequest(`/usage?window=${window}`);
}

export function getAudit(limit = 50): Promise<AuditRecord[]> {
  return adminRequest(`/audit?limit=${Math.min(Math.max(limit, 1), 200)}`);
}
