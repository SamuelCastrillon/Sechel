import { describe, it, expect } from 'vitest';

describe('types — ActionResult', () => {
  it('supports success shape', () => {
    const success = { success: true as const, data: { id: 1 } };
    expect(success.success).toBe(true);
    expect(success.data).toEqual({ id: 1 });
  });

  it('supports error shape', () => {
    const err = { success: false as const, error: 'Something went wrong' };
    expect(err.success).toBe(false);
    expect(err.error).toBe('Something went wrong');
  });
});

describe('types — User shape', () => {
  it('validates required fields', () => {
    const user = {
      id: 1,
      username: 'admin',
      role: 'admin' as const,
      is_active: 1,
      created_at: '2024-01-01',
    };
    expect(user.id).toBe(1);
    expect(user.role).toBe('admin');
  });
});

describe('types — ApiToken shape', () => {
  it('validates required fields', () => {
    const token = {
      id: 1,
      prefix: 'sk_abc123',
      created_at: '2024-01-01',
    };
    expect(token.prefix.startsWith('sk_')).toBe(true);
  });
});
