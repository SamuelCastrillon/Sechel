import { z } from 'zod';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { verifyToken } from '@/lib/auth';

const handler = createMcpHandler(
  (server) => {
    server.tool('ping', 'Health check / server info', {}, async () => ({
      content: [{ type: 'text', text: 'CortextMCP MCP server is alive' }],
    }));
  },
  {},
  { basePath: '/api' },
);

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ['read:memories'],
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
