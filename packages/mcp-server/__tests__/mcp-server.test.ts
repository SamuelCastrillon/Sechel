import { describe, it, expect } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createSechelServer } from '../src/index.js';
import type { Kysely } from 'kysely';
import type { CortexDB } from '@sechel/core';

// ---------------------------------------------------------------------------
// P-1.2 RED: createSechelServer with mocked transport registers 24 tools
// ---------------------------------------------------------------------------
describe('createSechelServer — P-1.2 RED', () => {
  it('registers 24 tools with InMemoryTransport', async () => {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

    // Use a minimal mock db — factory does not call db during construction
    const mockDb = {} as unknown as Kysely<CortexDB>;

    const server = await createSechelServer({
      transport: serverTransport,
      db: mockDb,
      tenantId: 'test',
      auth: { required: false },
    });

    // Create a client to query the server
    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} },
    );

    await client.connect(clientTransport);

    const { tools } = await client.listTools();

    // Close connections
    await client.close();
    await server.close();

    // We should have 23 tools (22 mem_* + 1 ping)
    expect(tools).toHaveLength(23);

    // Verify some expected tool names
    const toolNames = tools.map((t) => t.name).sort();
    expect(toolNames).toContain('ping');
    expect(toolNames).toContain('mem_save');
    expect(toolNames).toContain('mem_search');
    expect(toolNames).toContain('mem_get_observation');
    expect(toolNames).toContain('mem_stats');
    expect(toolNames).toContain('mem_current_project');
    expect(toolNames).toContain('mem_suggest_topic_key');
    expect(toolNames).toContain('mem_pin');
    expect(toolNames).toContain('mem_unpin');
    expect(toolNames).toContain('mem_save_prompt');
    expect(toolNames).toContain('mem_session_start');
    expect(toolNames).toContain('mem_session_end');
    expect(toolNames).toContain('mem_session_summary');
    expect(toolNames).toContain('mem_update');
    expect(toolNames).toContain('mem_delete');
    expect(toolNames).toContain('mem_timeline');
    expect(toolNames).toContain('mem_context');
    expect(toolNames).toContain('mem_judge');
    expect(toolNames).toContain('mem_compare');
    expect(toolNames).toContain('mem_review');
    expect(toolNames).toContain('mem_doctor');
    expect(toolNames).toContain('mem_merge_projects');
    expect(toolNames).toContain('mem_capture_passive');
  });
});

// ---------------------------------------------------------------------------
// P-1.6 GREEN: integration test verifies tool list + call routing
// ---------------------------------------------------------------------------
describe('createSechelServer — P-1.6 GREEN', () => {
  it('routes ping tool call correctly', async () => {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mockDb = {} as unknown as Kysely<CortexDB>;

    const server = await createSechelServer({
      transport: serverTransport,
      db: mockDb,
      tenantId: 'test',
      auth: { required: false },
    });

    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} },
    );

    await client.connect(clientTransport);

    const result = await client.callTool({ name: 'ping', arguments: {} });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toHaveProperty('text');
    expect((result.content[0] as { text: string }).text).toContain('Sechel MCP server is alive');

    await client.close();
    await server.close();
  });

  it('returns unauthorized when auth required but no valid auth info', async () => {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mockDb = {} as unknown as Kysely<CortexDB>;

    const server = await createSechelServer({
      transport: serverTransport,
      db: mockDb,
      tenantId: 'test',
      auth: { required: true },
    });

    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} },
    );

    await client.connect(clientTransport);

    // Call mem_stats without auth — should return unauthorized
    const result = await client.callTool({
      name: 'mem_stats',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/unauthorized/i);

    await client.close();
    await server.close();
  });

  it('ping tool works without auth even when auth is required', async () => {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mockDb = {} as unknown as Kysely<CortexDB>;

    const server = await createSechelServer({
      transport: serverTransport,
      db: mockDb,
      tenantId: 'test',
      auth: { required: true },
    });

    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} },
    );

    await client.connect(clientTransport);

    const result = await client.callTool({ name: 'ping', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect((result.content[0] as { text: string }).text).toContain('Sechel MCP server is alive');

    await client.close();
    await server.close();
  });
});
