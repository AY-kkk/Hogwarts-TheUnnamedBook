import { apiUrl } from '../config/api';

const SESSION_STORAGE_KEY = 'unnamedBookApiSession';
const EXPIRY_SKEW_MS = 30_000;

interface ApiSession {
  token: string;
  expiresAt: number;
}

let pendingSession: Promise<ApiSession> | null = null;

function readSession(): ApiSession | null {
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Partial<ApiSession>;
    if (
      typeof session.token === 'string' &&
      typeof session.expiresAt === 'number' &&
      session.expiresAt - EXPIRY_SKEW_MS > Date.now()
    ) {
      return session as ApiSession;
    }
  } catch {
    // A corrupt browser value is replaced by a fresh anonymous session.
  }
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  return null;
}

async function requestSession(): Promise<ApiSession> {
  const response = await fetch(apiUrl('/api/session'), { method: 'POST' });
  if (!response.ok) throw new Error(`无法建立安全会话（${response.status}）`);
  const data = (await response.json()) as { token?: string; expires_in?: number };
  if (typeof data.token !== 'string' || typeof data.expires_in !== 'number') {
    throw new Error('服务端返回了无效的会话数据');
  }
  const session = { token: data.token, expiresAt: Date.now() + data.expires_in * 1000 };
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export async function getSessionToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const current = readSession();
    if (current) return current.token;
  } else {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }

  pendingSession ??= requestSession().finally(() => {
    pendingSession = null;
  });
  return (await pendingSession).token;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = async (forceRefresh: boolean) => {
    const token = await getSessionToken(forceRefresh);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(apiUrl(path), { ...init, headers });
  };

  const response = await send(false);
  return response.status === 401 ? send(true) : response;
}
