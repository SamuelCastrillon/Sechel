import { createClient, type Client } from '@libsql/client';

let client: Client | null = null;

export function getDb(): Client {
  if (client) return client;

  const url = process.env.TURSO_URL;
  const token = process.env.TURSO_TOKEN;

  if (!url) {
    throw new Error('TURSO_URL is not set');
  }

  client = createClient({ url, authToken: token });
  return client;
}

// TODO: define schema/migrations for users, tokens, memories, sessions, projects (later).
