import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  mergeProjectsSchema,
  mergeProjects,
  type MergeProjectsInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';
import { resolveActor } from './auth-wrapper.js';

export function registerMemMergeProjects(server: McpServer, ctx: ToolContext): void {
  server.registerTool('mem_merge_projects', {
    description:
      'Rename a project across observations, sessions, and user_prompts tables.',
    inputSchema: mergeProjectsSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = resolveActor(extra, ctx);
      const parsed = mergeProjectsSchema.parse(args) as MergeProjectsInput;
      const result = await mergeProjects(ctx.db, ctx.tenantId, actor, parsed);
      return ok(result);
    } catch (e) {
      return error(e);
    }
  });
}
