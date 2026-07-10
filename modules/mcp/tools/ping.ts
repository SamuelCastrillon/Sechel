import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerPing(server: McpServer): void {
  server.registerTool(
    'ping',
    { description: 'Health check / server info' },
    async () => ({
      content: [{ type: 'text', text: 'Sechel MCP server is alive' }],
    }),
  );
}
