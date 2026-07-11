import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  updateObservation,
  updateSchema,
  actorFromAuthInfo,
  type UpdateInput,
} from '@sechel/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';

export function registerMemUpdate(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'mem_update',
    {
      description:
        'Update an existing observation by ID. Only provided fields are changed.',
      inputSchema: updateSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) return error('Unauthorized: missing or invalid token');
        const parsed = updateSchema.parse(args) as UpdateInput;
        const result = await updateObservation(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
