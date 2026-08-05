import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AdminAuthenticationError,
  activateProvider,
  adminLogin,
  adminLogout,
  discoverModels,
  getAdminSession,
  getUsage,
  testProvider,
  updateProvider,
  type ModelProvider,
} from './adminApi';

const providerFixture: ModelProvider = {
  id: 'provider-1',
  name: 'DeepSeek',
  preset: 'deepseek',
  base_url: 'https://api.deepseek.com',
  api_key_last4: '1234',
  has_api_key: true,
  models: ['deepseek-chat'],
  active_model: 'deepseek-chat',
  is_enabled: true,
  is_active: true,
  created_at: '2026-08-06T00:00:00Z',
  updated_at: '2026-08-06T00:00:00Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('administrator API client', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses credentialed requests and omits an empty edit key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(providerFixture));

    await updateProvider('provider-1', { name: 'DeepSeek', api_key: '' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://localhost:3000/api/admin/providers/provider-1');
    expect(init?.credentials).toBe('include');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'DeepSeek' });
  });

  it('maps a 401 response to the dedicated authentication error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ detail: 'expired' }, 401));

    await expect(getUsage('24h')).rejects.toBeInstanceOf(AdminAuthenticationError);
  });

  it('supports login, session, discovery, test, activation and logout paths', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: true, username: 'owner' }))
      .mockResolvedValueOnce(jsonResponse({ models: ['mock-chat'] }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          model: 'mock-chat',
          latency_ms: 10,
          input_tokens: 2,
          output_tokens: 1,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(providerFixture))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await adminLogin('owner', 'password');
    expect(await getAdminSession()).toEqual({ authenticated: true, username: 'owner' });
    expect(await discoverModels('provider-1')).toEqual(['mock-chat']);
    expect((await testProvider('provider-1', 'mock-chat')).ok).toBe(true);
    expect((await activateProvider('provider-1', 'mock-chat')).is_active).toBe(true);
    await adminLogout();

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://localhost:3000/api/admin/session',
      'http://localhost:3000/api/admin/session',
      'http://localhost:3000/api/admin/providers/provider-1/discover',
      'http://localhost:3000/api/admin/providers/provider-1/test',
      'http://localhost:3000/api/admin/providers/provider-1/activate',
      'http://localhost:3000/api/admin/session',
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init?.credentials === 'include')).toBe(true);
  });
});

