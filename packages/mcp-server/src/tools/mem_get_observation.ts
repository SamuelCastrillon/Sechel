import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getObservation,
  getObservationSchema,
  type GetObservationInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';
import { resolveActor } from './auth-wrapper.js';

export function registerMemGetObservation(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'mem_get_observation',
    {
      description:
        'Get the full content of a specific observation by ID. Use when you need the complete, untruncated content of an observation found via mem_search or mem_timeline.',
      inputSchema: getObservationSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = resolveActor(extra, ctx);
        const parsed = getObservationSchema.parse(args) as GetObservationInput;
        const result = await getObservation(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
