import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Kysely } from 'kysely';
import type { CortexDB } from '@sechel-mcp/core';
import { registerAllTools, type ToolContext } from './tools/index.js';

/**
 * Configuration for creating a Sechel MCP server.
 */
export interface SechelServerConfig {
  /** The transport to use (StdioServerTransport | StreamableHTTPServerTransport | InMemoryTransport) */
  transport: Transport;
  /** A connected Kysely database instance */
  db: Kysely<CortexDB>;
  /** The tenant ID for scoping data */
  tenantId: string;
  /** Optional auth configuration */
  auth?: {
    required: boolean;
    requiredScopes?: string[];
  };
}

/**
 * Create and connect a Sechel MCP server.
 *
 * The factory registers all 24 tools (23 mem_* tools + ping) on an McpServer
 * instance, connects it to the given transport, and returns the server.
 *
 * Auth is handled via the SDK's built-in authInfo mechanism: the transport may
 * provide validated auth info (via OAuth or InMemoryTransport's authInfo option),
 * which tool handlers use to extract the actor. When auth is required and no
 * valid auth info is present, tools return an Unauthorized error. Ping skips auth.
 *
 * @example
 * ```ts
 * const db = await createDb({ url: ':memory:' });
 * const transport = new StdioServerTransport();
 * const server = await createSechelServer({ transport, db, tenantId: 'default' });
 * ```
 */
export async function createSechelServer(config: SechelServerConfig): Promise<McpServer> {
  const { transport, db, tenantId } = config;

  const server = new McpServer(
    { name: 'sechel-mcp-server', version: '0.3.0' },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const ctx: ToolContext = { db, tenantId };

  registerAllTools(server, ctx);

  await server.connect(transport);

  return server;
}
