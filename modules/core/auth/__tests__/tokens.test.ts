import { describe, it, expect } from 'vitest';
import { generateApiToken, hashToken } from '../tokens';

describe('tokens — API token generation', () => {
  it('generateApiToken produces raw, hash, and prefix', () => {
    const token = generateApiToken();

    expect(token.raw).toBeTruthy();
    expect(token.raw.length).toBe(80);
    expect(token.hash).toBeTruthy();
    expect(token.hash.length).toBe(64);
    expect(token.prefix).toBeTruthy();
  });

  it('prefix starts with sk_', () => {
    const token = generateApiToken();
    expect(token.prefix).toMatch(/^sk_/);
    expect(token.prefix.length).toBe(10);
  });

  it('hashToken produces a SHA-256 hex string', () => {
    const raw = 'some-test-token-value-12345';
    const hash = hashToken(raw);

    expect(hash).toBeTruthy();
    expect(hash.length).toBe(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generateApiToken hash matches hashToken(raw)', () => {
    const token = generateApiToken();
    const expectedHash = hashToken(token.raw);

    expect(token.hash).toBe(expectedHash);
  });

  it('different tokens produce different hashes', () => {
    const t1 = generateApiToken();
    const t2 = generateApiToken();

    expect(t1.hash).not.toBe(t2.hash);
    expect(t1.raw).not.toBe(t2.raw);
  });
});
