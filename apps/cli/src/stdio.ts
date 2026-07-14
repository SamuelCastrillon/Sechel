import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSechelServer } from '@sechel-mcp/mcp-server';
import { createDb } from '@sechel-mcp/core';
import path from 'node:path';
import { ensureConfigDir, loadConfig, getDefaultDbPath } from './config.js';

/**
 * Start stdio mode: local SQLite DB with StdioServerTransport.
 * This is the default mode when `sechel` is run with no arguments.
 */
export async function startStdio(): Promise<void> {
  await ensureConfigDir();
  const config = await loadConfig();
  const dbPath = config.dbPath ?? getDefaultDbPath();
  const db = await createDb({ url: `file:${path.resolve(dbPath)}` });

  const transport = new StdioServerTransport();

  await createSechelServer({
    transport,
    db,
    tenantId: 'default',
    auth: { required: false },
  });

  // The process stays alive via the stdio transport connection.
  // The SDK manages stdin/stdout for MCP protocol messages.
}
