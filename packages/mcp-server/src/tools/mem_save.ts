import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  saveObservation,
  saveSchema,
  actorFromAuthInfo,
  type SaveInput,
  type Actor,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';

export function registerMemSave(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'mem_save',
    {
      description:
        'Save a memory observation (Engram-compatible). Upserts by topic_key, dedupes within 15 min, and surfaces conflicts via judgment_required/candidates.',
      inputSchema: saveSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) return error('Unauthorized: missing or invalid token');
        const parsed = saveSchema.parse(args) as SaveInput;
        const result = await saveObservation(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
