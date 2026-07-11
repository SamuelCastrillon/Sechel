import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getObservation,
  getObservationSchema,
  actorFromAuthInfo,
  type GetObservationInput,
} from '@sechel/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';

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
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) return error('Unauthorized: missing or invalid token');
        const parsed = getObservationSchema.parse(args) as GetObservationInput;
        const result = await getObservation(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
