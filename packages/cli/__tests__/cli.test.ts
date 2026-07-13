import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createDb } from '@sechel-mcp/core';
import type { Kysely } from 'kysely';
import type { CortexDB } from '@sechel-mcp/core';

// ---------------------------------------------------------------------------
// P-4.2 RED: Stdio mode + HTTP mode
// Tests reference modules that exist but behaviors that are exercised via
// the app factory (start.ts) and the stdio integration (stdio.ts).
// ---------------------------------------------------------------------------

describe('CLI HTTP mode — P-4.2 RED', () => {
  let db: Kysely<CortexDB>;

  beforeEach(async () => {
    db = await createDb({ url: ':memory:' });
  });

  it('createApp returns a Hono app with health endpoint', async () => {
    const { createApp } = await import('../src/start.js');
    const app = createApp(db);

    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('MCP endpoint responds to initialize request with 200 and serverInfo', async () => {
    const { createApp } = await import('../src/start.js');
    const app = createApp(db);

    // MCP Streamable HTTP requires Accept header with both content types
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('jsonrpc', '2.0');
    expect(body).toHaveProperty('id', 1);
    expect(body).toHaveProperty('result');
    expect(body.result).toHaveProperty('serverInfo');
  });

  it('MCP endpoint handles ListTools after initialize', async () => {
    const { createApp } = await import('../src/start.js');
    const app = createApp(db);

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    // Initialize
    const initRes = await app.request('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      }),
    });

    // Extract session ID from the initialize response
    const initBody = await initRes.json();
    const sessionId = initRes.headers.get('mcp-session-id') ?? '';

    // Send initialized notification
    await app.request('/mcp', {
      method: 'POST',
      headers: {
        ...headers,
        'Mcp-Session-Id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });

    // ListTools
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        ...headers,
        'Mcp-Session-Id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('jsonrpc', '2.0');
    expect(body).toHaveProperty('id', 2);
    expect(body).toHaveProperty('result');
    expect(body.result).toHaveProperty('tools');
    expect(Array.isArray(body.result.tools)).toBe(true);
    expect(body.result.tools.length).toBeGreaterThan(0);
  });
});

describe('CLI stdio mode — P-4.2 RED', () => {
  it('can create a Sechel server with InMemoryTransport simulating stdio', async () => {
    // Simulate what startStdio does: create db + transport + server
    const db = await createDb({ url: ':memory:' });

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

    // Import and use the same factory as stdio.ts
    const { createSechelServer } = await import('@sechel/mcp-server');
    const server = await createSechelServer({
      transport: serverTransport,
      db,
      tenantId: 'default',
      auth: { required: false },
    });

    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} },
    );
    await client.connect(clientTransport);

    // Verify tools work
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(23);
    expect(tools.map((t) => t.name)).toContain('ping');

    await client.close();
    await server.close();
  });
});
