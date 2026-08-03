/**
 * @sechel-mcp/cli — Sechel CLI entry point.
 *
 * Usage:
 *   sechel          Start stdio MCP server with local SQLite
 */

import { startStdio } from './stdio.js';

startStdio().catch((err) => {
  console.error(err);
  process.exit(1);
});
