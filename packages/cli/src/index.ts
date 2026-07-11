/**
 * @sechel/cli — Sechel CLI entry point.
 *
 * Usage:
 *   sechel          Start stdio MCP server with local SQLite
 *   sechel start    Start HTTP MCP server on localhost:3030
 */

import { startStdio } from './stdio.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === 'start') {
    const { startHttp } = await import('./start.js');
    await startHttp();
  } else {
    await startStdio();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
