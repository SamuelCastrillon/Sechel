import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

// TODO: validate the bearer token against the users table in Turso (later).
export async function verifyToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  return {
    token: bearerToken,
    scopes: ['read:memories', 'write:memories'],
    clientId: 'stub',
    extra: { userId: 'stub' },
  };
}
