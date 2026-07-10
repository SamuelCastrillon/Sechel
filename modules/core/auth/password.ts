import 'server-only';
import { argon2id, argon2Verify } from 'hash-wasm';

/**
 * Hash a password using argon2id (OWASP-recommended, ASIC-resistant).
 * Returns an encoded string containing algorithm, version, parameters, salt, and hash.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536, // 64 MB
    hashLength: 32,
    outputType: 'encoded',
  });
}

/**
 * Verify a password against an argon2id-encoded hash.
 * Returns true if the password matches, false otherwise.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argon2Verify({
    password,
    hash,
  });
}
