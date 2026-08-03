import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  compareSchema,
  compareMemories,
  type CompareInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';
import { resolveActor } from './auth-wrapper.js';

export function registerMemCompare(server: McpServer, ctx: ToolContext): void {
  server.registerTool('mem_compare', {
    description:
      'Persist a semantic verdict you have already judged externally (with your LLM) into Engram.',
    inputSchema: compareSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = resolveActor(extra, ctx);
      const parsed = compareSchema.parse(args) as CompareInput;
      const result = await compareMemories(ctx.db, ctx.tenantId, actor, parsed);
      return ok(result);
    } catch (e) {
      return error(e);
    }
  });
}
