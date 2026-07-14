import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Hono } from 'hono';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Env } from '../src/index.js';

// ---------------------------------------------------------------------------
// P-2.2 RED: Hono MCP endpoint POST /mcp returns ListTools response
// P-2.3   : Hono app with StreamableHTTP transport + admin routes
// ---------------------------------------------------------------------------

// Temp file-based DB so we can seed it before tests
const TEST_DB_PATH = join(tmpdir(), `sechel-test-mcp-${Date.now()}.db`);
const TEST_TOKEN = 'sk-test-token-81327f1b9a8c4d5e';
const TEST_TOKEN_HASH = createHash('sha256').update(TEST_TOKEN, 'utf-8').digest('hex');

let testEnv: Env;
let createApp: () => Hono<{ Bindings: Env }>;

beforeAll(async () => {
  // Seed the temp DB with an admin user and a token
  const { createDb } = await import('@sechel-mcp/core');
  const db = await createDb({ url: `file:${TEST_DB_PATH}` });

  // Create admin user (is_active = 1 by default with the fixed migration)
  await sql`
    INSERT INTO users (tenant_id, username, role, credential_hash, is_active)
    VALUES ('test', 'test-admin', 'admin', 'unused', 1)
  `.execute(db);

  // Create a token for this user
  const user = await sql<{ id: number }>`
    SELECT id FROM users WHERE tenant_id = 'test' AND username = 'test-admin'
  `.execute(db);
  const userId = user.rows[0].id;

  await sql`
    INSERT INTO user_tokens (tenant_id, user_id, prefix, token_hash, description)
    VALUES ('test', ${userId}, 'sk_test_', ${TEST_TOKEN_HASH}, 'test token')
  `.execute(db);

  await db.destroy();

  testEnv = {
    DATABASE_URL: `file:${TEST_DB_PATH}`,
    TENANT_ID: 'test',
  };

  const mod = await import('../src/index.js');
  createApp = mod.createApp;
});

afterAll(() => {
  try { unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
});

// ---- Admin routes ---------------------------------------------------------

describe('Admin routes', () => {
  it('GET /admin/health returns 200 with status ok', async () => {
    const app = createApp();
    const res = await app.request('/admin/health', {}, testEnv);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('POST /admin/auth/login returns 501 Not Implemented', async () => {
    const app = createApp();
    const res = await app.request(
      '/admin/auth/login',
      { method: 'POST' },
      testEnv,
    );

    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ error: 'Not implemented yet' });
  });
});

// ---- Helpers ---------------------------------------------------------------
// The MCP StreamableHTTP transport returns SSE (text/event-stream) by default.
// We parse SSE messages to extract JSON-RPC response bodies.
// ---------------------------------------------------------------------------

/** Parse an SSE response body into JSON-RPC message bodies. */
async function parseSSEToMessages(
  res: Response,
): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  const messages: Record<string, unknown>[] = [];

  for (const block of text.split('\n\n')) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const dataMatch = trimmed.match(/^data: (.+)$/m);
    if (dataMatch) {
      try {
        messages.push(JSON.parse(dataMatch[1]) as Record<string, unknown>);
      } catch {
        // skip unparseable data lines
      }
    }
  }

  return messages;
}

// ---- MCP endpoint ---------------------------------------------------------
// The MCP StreamableHTTP transport requires:
//   Content-Type: application/json
//   Accept:       application/json, text/event-stream
// These are mandated by the Streamable HTTP transport spec and enforced
// by WebStandardStreamableHTTPServerTransport.
// ---------------------------------------------------------------------------
const mcpHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
  'MCP-Protocol-Version': '2025-11-05',
  Authorization: `Bearer ${TEST_TOKEN}`,
};

// Headers for error-case tests (missing Content-Type or Accept) — still include auth
const mcpHeadersNoContentType = {
  Accept: 'application/json, text/event-stream',
  'MCP-Protocol-Version': '2025-11-05',
  Authorization: `Bearer ${TEST_TOKEN}`,
};

const mcpHeadersNoAccept = {
  'Content-Type': 'application/json',
  'MCP-Protocol-Version': '2025-11-05',
  Authorization: `Bearer ${TEST_TOKEN}`,
};

describe('MCP endpoint', () => {
  it('POST /mcp handles initialize and returns server capabilities', async () => {
    const app = createApp();

    const res = await app.request(
      '/mcp',
      {
        method: 'POST',
        headers: mcpHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'test-init-1',
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      },
      testEnv,
    );

    // The transport returns either SSE stream (default) or JSON
    // when enableJsonResponse is true. We handle both.
    expect(res.status).toBe(200);

    const ct = res.headers.get('content-type') ?? '';
    let body: Record<string, unknown>;

    if (ct.includes('text/event-stream')) {
      // SSE mode — parse the data block
      const msgs = await parseSSEToMessages(res);
      expect(msgs.length).toBeGreaterThanOrEqual(1);
      body = msgs[0];
    } else {
      // JSON mode
      body = (await res.json()) as Record<string, unknown>;
    }

    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe('test-init-1');

    // Must return server info
    const result = body.result as Record<string, unknown> | undefined;
    expect(result).toBeDefined();
    const serverInfo = result!.serverInfo as Record<string, unknown>;
    expect(serverInfo).toBeDefined();
    expect(serverInfo.name).toBe('sechel-mcp-server');

    // Must advertise tool capabilities
    const capabilities = result!.capabilities as Record<string, unknown>;
    expect(capabilities).toBeDefined();
    expect(capabilities.tools).toBeDefined();
  });

  it('POST /mcp returns 415 when Content-Type is missing', async () => {
    const app = createApp();

    const res = await app.request(
      '/mcp',
      {
        method: 'POST',
        headers: mcpHeadersNoContentType,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'test-err-1',
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      },
      testEnv,
    );

    expect(res.status).toBe(415);
  });

  it('POST /mcp returns 406 when Accept header is missing', async () => {
    const app = createApp();

    const res = await app.request(
      '/mcp',
      {
        method: 'POST',
        headers: mcpHeadersNoAccept,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'test-err-2',
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      },
      testEnv,
    );

    expect(res.status).toBe(406);
  });
});
