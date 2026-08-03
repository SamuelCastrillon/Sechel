import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  updateObservation,
  updateSchema,
  type UpdateInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';
import { resolveActor } from './auth-wrapper.js';

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
        const actor = resolveActor(extra, ctx);
        const parsed = updateSchema.parse(args) as UpdateInput;
        const result = await updateObservation(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
