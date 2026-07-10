import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../password';

describe('password — argon2id hash & verify', () => {
  it('hashPassword produces a verifiable hash', async () => {
    const password = 'my-secret-password-123';
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash.length).toBeGreaterThan(60);

    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);
  });

  it('verifyPassword rejects wrong password', async () => {
    const password = 'correct-password';
    const wrong = 'wrong-password';
    const hash = await hashPassword(password);

    const valid = await verifyPassword(wrong, hash);
    expect(valid).toBe(false);
  });

  it('different passwords produce different hashes', async () => {
    const hash1 = await hashPassword('password-1');
    const hash2 = await hashPassword('password-2');

    expect(hash1).not.toBe(hash2);
  });

  it('same password produces different hashes (unique salt)', async () => {
    const hash1 = await hashPassword('same-password');
    const hash2 = await hashPassword('same-password');

    expect(hash1).not.toBe(hash2);
  });
});
