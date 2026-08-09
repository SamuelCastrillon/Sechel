import type { ActionResult, User, ApiToken, InstanceSettings } from './types';

const API_BASE = '/api/admin';
const LOGIN_PATH = '/admin/login';

/**
 * Single-flight session refresh (design decision 7): N parallel 401s share one
 * in-flight POST /auth/refresh so the rotation endpoint is hit once, not N
 * times. The promise is replaced on settle, so a later 401 starts a fresh
 * single-flight refresh.
 *
 * The refresh call is a raw fetch — it never runs through the 401 interceptor,
 * so a refresh 401 can never recurse into another refresh (PR-1 gate: refresh
 * excluded by construction; refresh failure → login redirect).
 */
let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function redirectToLogin(): void {
  if (typeof window !== 'undefined') {
    window.location.href = LOGIN_PATH;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retryOn401 = true,
): Promise<T> {
  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

  let res = await doFetch();

  if (res.status === 401 && retryOn401) {
    // PR-1: 401 → one shared refresh → retry the original request ONCE.
    const refreshed = await refreshSession();
    if (!refreshed) {
      // Refresh expired/revoked (or unreachable) — the session is dead.
      redirectToLogin();
      throw new Error('Session expired');
    }
    res = await doFetch();
    if (res.status === 401) {
      // Retry still rejected — the session died between refresh and retry.
      redirectToLogin();
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.json();
}

// ── Auth ──

export async function login(username: string, password: string): Promise<{ user: User }> {
  // A 401 here means bad credentials, not an expired session — never refresh.
  return request(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    },
    false,
  );
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
}

// ── Users ──

export async function listUsers(): Promise<User[]> {
  const data = await request<{ users: User[] }>('/users');
  return data.users;
}

export async function createUser(data: { username: string; password: string; role?: string }): Promise<User> {
  return request('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUserRole(userId: number, role: string): Promise<User> {
  return request(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function toggleUserActive(userId: number): Promise<User> {
  return request(`/users/${userId}/toggle-active`, {
    method: 'POST',
  });
}

export async function setUserPermission(userId: number, project: string, permission: string): Promise<void> {
  return request(`/users/${userId}/permissions`, {
    method: 'POST',
    body: JSON.stringify({ project, permission }),
  });
}

// ── Settings ──

export async function getSettings(): Promise<InstanceSettings> {
  return request('/settings');
}

export async function updateSettings(settings: Partial<InstanceSettings>): Promise<InstanceSettings> {
  return request('/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

// ── API Tokens ──

export async function listTokens(): Promise<ApiToken[]> {
  const data = await request<{ tokens: ApiToken[] }>('/tokens');
  return data.tokens;
}

export async function createToken(): Promise<{ token: ApiToken; raw: string }> {
  return request('/tokens', {
    method: 'POST',
    body: JSON.stringify({ description: 'created from panel' }),
  });
}

export async function revokeToken(tokenId: number): Promise<void> {
  return request(`/tokens/${tokenId}`, {
    method: 'DELETE',
  });
}
