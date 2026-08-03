import type { ActionResult, User, ApiToken, InstanceSettings } from './types';

const API_BASE = '/api/admin';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.json();
}

// ── Auth ──

export async function login(username: string, password: string): Promise<{ user: User }> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
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
  });
}

export async function revokeToken(tokenId: number): Promise<void> {
  return request(`/tokens/${tokenId}`, {
    method: 'DELETE',
  });
}
