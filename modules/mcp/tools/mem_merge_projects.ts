import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveDb, mergeProjectsSchema, type MergeProjectsInput } from '@/modules/core/domain';
import { mergeProjects } from '@/modules/core/domain/store-admin';
import { actorFromAuthInfo } from '@/modules/core/auth';

export function registerMemMergeProjects(server: McpServer): void {
  server.registerTool('mem_merge_projects', {
    description:
      'Rename a project across observations, sessions, and user_prompts tables.',
    inputSchema: mergeProjectsSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = actorFromAuthInfo(extra.authInfo);
      if (!actor) throw new Error('Unauthorized: missing or invalid token');
      const parsed = mergeProjectsSchema.parse(args) as MergeProjectsInput;
      const db = await resolveDb();
      const result = await mergeProjects(db, actor, parsed);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  });
}
