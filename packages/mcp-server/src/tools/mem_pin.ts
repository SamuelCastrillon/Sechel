import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  pinObservation,
  pinSchema,
  type PinInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';
import { resolveActor } from './auth-wrapper.js';

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
        const actor = resolveActor(extra, ctx);
        const parsed = pinSchema.parse(args) as PinInput;
        const result = await pinObservation(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
