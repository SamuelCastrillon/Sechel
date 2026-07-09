import 'server-only';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { verifyToken } from '@/modules/core/auth';
import { registerPing } from './tools/ping';
import { registerMemSave } from './tools/mem_save';
import { registerMemSearch } from './tools/mem_search';

export const handler = withMcpAuth(
  createMcpHandler(
    (server) => {
      registerPing(server);
      registerMemSave(server);
      registerMemSearch(server);
    },
    {},
    { basePath: '/api' },
  ),
  verifyToken,
  {
    required: true,
    requiredScopes: ['read:memories'],
    resourceMetadataPath: '/.well-known/oauth-protected-resource',
  },
);
