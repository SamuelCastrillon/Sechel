import { describe, it, expect } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createDb } from '@sechel-mcp/core';

// ---------------------------------------------------------------------------
// P-4.2 GREEN: Stdio mode
// ---------------------------------------------------------------------------

describe('CLI stdio mode — P-4.2 RED', () => {
  it('can create a Sechel server with InMemoryTransport simulating stdio', async () => {
    // Simulate what startStdio does: create db + transport + server
    const db = await createDb({ url: ':memory:' });

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

    // Import and use the same factory as stdio.ts
    const { createSechelServer } = await import('@sechel-mcp/mcp-server');
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
