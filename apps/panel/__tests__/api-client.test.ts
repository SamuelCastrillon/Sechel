import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('api-client — login', () => {
  it('calls POST /api/admin/auth/login with credentials', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: { id: 1, username: 'admin', role: 'admin', is_active: 1, created_at: '' } }),
    });

    const { login } = await import('@/lib/api-client');
    const result = await login('admin', 'pass123');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'admin', password: 'pass123' }),
      }),
    );
    expect(result.user.username).toBe('admin');
  });

  it('throws on failed login', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Invalid credentials' }),
    });

    const { login } = await import('@/lib/api-client');
    await expect(login('admin', 'wrong')).rejects.toThrow('Invalid credentials');
  });
});

describe('api-client — users', () => {
  it('listUsers calls GET /api/admin/users', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ users: [{ id: 1, username: 'admin', role: 'admin' }] }),
    });

    const { listUsers } = await import('@/lib/api-client');
    const users = await listUsers();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/users',
      expect.any(Object),
    );
    expect(users).toHaveLength(1);
  });

  it('createUser sends POST with body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 2, username: 'newuser', role: 'member', is_active: 1, created_at: '' }),
    });

    const { createUser } = await import('@/lib/api-client');
    const user = await createUser({ username: 'newuser', password: 'pass123' });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'newuser', password: 'pass123' }),
      }),
    );
    expect(user.username).toBe('newuser');
  });
});

describe('api-client — tokens', () => {
  it('listTokens calls GET /api/admin/tokens', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ tokens: [{ id: 1, prefix: 'sk_abc', created_at: '' }] }),
    });

    const { listTokens } = await import('@/lib/api-client');
    const tokens = await listTokens();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/tokens',
      expect.any(Object),
    );
    expect(tokens).toHaveLength(1);
  });

  it('revokeToken calls DELETE', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    const { revokeToken } = await import('@/lib/api-client');
    await revokeToken(42);

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/tokens/42',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('api-client — settings', () => {
  it('getSettings calls GET /api/admin/settings', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ registration_enabled: true }),
    });

    const { getSettings } = await import('@/lib/api-client');
    const settings = await getSettings();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/settings',
      expect.any(Object),
    );
    expect(settings.registration_enabled).toBe(true);
  });

  it('updateSettings sends PATCH', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ registration_enabled: false }),
    });

    const { updateSettings } = await import('@/lib/api-client');
    await updateSettings({ registration_enabled: false });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/settings',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ registration_enabled: false }),
      }),
    );
  });
});
