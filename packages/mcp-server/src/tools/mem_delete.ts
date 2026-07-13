import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  deleteObservation,
  deleteSchema,
  actorFromAuthInfo,
  type DeleteInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';

export function registerMemDelete(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'mem_delete',
    {
      description:
        'Delete an observation. Soft delete (default) by setting deleted_at, or hard delete with orphaned memory_relations.',
      inputSchema: deleteSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) return error('Unauthorized: missing or invalid token');
        const parsed = deleteSchema.parse(args) as DeleteInput;
        const result = await deleteObservation(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
