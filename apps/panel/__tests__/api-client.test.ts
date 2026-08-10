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

  it('createToken sends POST with a default description', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token: { id: 1, prefix: 'sk_abc', created_at: '' }, raw: 'abc' }),
    });

    const { createToken } = await import('@/lib/api-client');
    await createToken();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/tokens',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ description: 'created from panel' }),
      }),
    );
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

describe('api-client — 401 refresh flow (PR-1/PR-3)', () => {
  const ok = (data: unknown) => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  });
  const unauthorized = {
    ok: false,
    status: 401,
    json: () => Promise.resolve({ error: 'Unauthorized' }),
  };

  it('parallel 401s trigger exactly ONE refresh, then each original request retries successfully', async () => {
    mockFetch
      .mockResolvedValueOnce(unauthorized)
      .mockResolvedValueOnce(unauthorized)
      .mockResolvedValueOnce(unauthorized)
      .mockResolvedValueOnce(ok({ token: 'fresh-access' }))
      .mockResolvedValueOnce(ok({ users: [{ id: 1, username: 'admin', role: 'admin' }] }))
      .mockResolvedValueOnce(ok({ registration_enabled: true }))
      .mockResolvedValueOnce(ok({ tokens: [] }));

    const { listUsers, getSettings, listTokens } = await import('@/lib/api-client');
    const [users, settings, tokens] = await Promise.all([
      listUsers(),
      getSettings(),
      listTokens(),
    ]);

    const refreshCalls = mockFetch.mock.calls.filter(
      ([url]) => url === '/api/admin/auth/refresh',
    );
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0][1]).toMatchObject({ method: 'POST' });
    expect(users).toHaveLength(1);
    expect(settings.registration_enabled).toBe(true);
    expect(tokens).toEqual([]);
  });

  it('refresh 401 redirects to login and never re-enters the interceptor (no recursion)', async () => {
    vi.stubGlobal('window', { location: { href: '' } });
    try {
      mockFetch
        .mockResolvedValueOnce(unauthorized)
        .mockResolvedValueOnce(unauthorized);

      const { listUsers } = await import('@/lib/api-client');
      await expect(listUsers()).rejects.toThrow('Session expired');

      expect(
        mockFetch.mock.calls.filter(([url]) => url === '/api/admin/auth/refresh'),
      ).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect((globalThis as { window?: { location: { href: string } } }).window).toMatchObject({
        location: { href: '/admin/login' },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('session revoked server-side → refresh 401 → login redirect; original never retried', async () => {
    vi.stubGlobal('window', { location: { href: '' } });
    try {
      mockFetch
        .mockResolvedValueOnce(unauthorized)
        .mockResolvedValueOnce(unauthorized);

      const { getSettings } = await import('@/lib/api-client');
      await expect(getSettings()).rejects.toThrow('Session expired');

      expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
        '/api/admin/settings',
        '/api/admin/auth/refresh',
      ]);
      expect((globalThis as { window?: { location: { href: string } } }).window).toMatchObject({
        location: { href: '/admin/login' },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('retry 401 after a successful refresh also redirects to login', async () => {
    vi.stubGlobal('window', { location: { href: '' } });
    try {
      mockFetch
        .mockResolvedValueOnce(unauthorized)
        .mockResolvedValueOnce(ok({ token: 'fresh-access' }))
        .mockResolvedValueOnce(unauthorized);

      const { listTokens } = await import('@/lib/api-client');
      await expect(listTokens()).rejects.toThrow('Session expired');

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect((globalThis as { window?: { location: { href: string } } }).window).toMatchObject({
        location: { href: '/admin/login' },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('single-flight holds on refresh FAILURE too: N parallel 401s → one refresh, all redirect', async () => {
    vi.stubGlobal('window', { location: { href: '' } });
    try {
      mockFetch
        .mockResolvedValueOnce(unauthorized)
        .mockResolvedValueOnce(unauthorized)
        .mockResolvedValueOnce(unauthorized)
        .mockResolvedValueOnce(unauthorized);

      const { listUsers, getSettings, listTokens } = await import('@/lib/api-client');
      await expect(Promise.all([listUsers(), getSettings(), listTokens()])).rejects.toThrow(
        'Session expired',
      );

      expect(
        mockFetch.mock.calls.filter(([url]) => url === '/api/admin/auth/refresh'),
      ).toHaveLength(1);
      expect((globalThis as { window?: { location: { href: string } } }).window).toMatchObject({
        location: { href: '/admin/login' },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('login 401 (bad credentials) does NOT trigger a refresh', async () => {
    mockFetch.mockResolvedValueOnce(unauthorized);

    const { login } = await import('@/lib/api-client');
    await expect(login('admin', 'wrong')).rejects.toThrow('Unauthorized');

    expect(
      mockFetch.mock.calls.filter(([url]) => url === '/api/admin/auth/refresh'),
    ).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
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
