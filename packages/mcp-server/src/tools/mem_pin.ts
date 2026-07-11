import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  pinObservation,
  pinSchema,
  actorFromAuthInfo,
  type PinInput,
} from '@sechel/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';

export function registerMemPin(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'mem_pin',
    {
      description:
        'Pin a local observation so it appears before recent observations in memory context. Pinned state is local to this device and is not synced.',
      inputSchema: pinSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) return error('Unauthorized: missing or invalid token');
        const parsed = pinSchema.parse(args) as PinInput;
        const result = await pinObservation(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
