import 'server-only';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { verifyToken } from '@/modules/core/auth';
import { registerPing } from './tools/ping';
import { registerMemSave } from './tools/mem_save';
import { registerMemSearch } from './tools/mem_search';
import { registerMemJudge } from './tools/mem_judge';
import { registerMemCompare } from './tools/mem_compare';
import { registerMemReview } from './tools/mem_review';
import { registerMemDoctor } from './tools/mem_doctor';
import { registerMemMergeProjects } from './tools/mem_merge_projects';
import { registerMemCapturePassive } from './tools/mem_capture_passive';

export const handler = withMcpAuth(
  createMcpHandler(
    (server) => {
      registerPing(server);
      registerMemSave(server);
      registerMemSearch(server);
      registerMemJudge(server);
      registerMemCompare(server);
      registerMemReview(server);
      registerMemDoctor(server);
      registerMemMergeProjects(server);
      registerMemCapturePassive(server);
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
