import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  mergeProjectsSchema,
  mergeProjects,
  actorFromAuthInfo,
  type MergeProjectsInput,
} from '@sechel/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';

export function registerMemMergeProjects(server: McpServer, ctx: ToolContext): void {
  server.registerTool('mem_merge_projects', {
    description:
      'Rename a project across observations, sessions, and user_prompts tables.',
    inputSchema: mergeProjectsSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = actorFromAuthInfo(extra.authInfo);
      if (!actor) return error('Unauthorized: missing or invalid token');
      const parsed = mergeProjectsSchema.parse(args) as MergeProjectsInput;
      const result = await mergeProjects(ctx.db, ctx.tenantId, actor, parsed);
      return ok(result);
    } catch (e) {
      return error(e);
    }
  });
}
