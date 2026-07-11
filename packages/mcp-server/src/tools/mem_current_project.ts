import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getCurrentProject,
  currentProjectSchema,
  actorFromAuthInfo,
  type CurrentProjectInput,
} from '@sechel/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';

export function registerMemCurrentProject(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'mem_current_project',
    {
      description:
        'Detect the current project from the working directory. Returns project name, source (how it was detected), path, and available alternatives. NEVER errors — use this for discovery before writing.',
      inputSchema: currentProjectSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) return error('Unauthorized: missing or invalid token');
        const parsed = currentProjectSchema.parse(args) as CurrentProjectInput;
        const result = await getCurrentProject(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
