import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  capturePassiveSchema,
  capturePassive,
  actorFromAuthInfo,
  type CapturePassiveInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';

export function registerMemCapturePassive(server: McpServer, ctx: ToolContext): void {
  server.registerTool('mem_capture_passive', {
    description:
      'Extract and save structured learnings from text output. Parses "## Key Learnings" or "## Aprendizajes Clave" sections and saves each item as a separate observation.',
    inputSchema: capturePassiveSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = actorFromAuthInfo(extra.authInfo);
      if (!actor) return error('Unauthorized: missing or invalid token');
      const parsed = capturePassiveSchema.parse(args) as CapturePassiveInput;
      const result = await capturePassive(ctx.db, ctx.tenantId, actor, parsed);
      return ok(result);
    } catch (e) {
      return error(e);
    }
  });
}
