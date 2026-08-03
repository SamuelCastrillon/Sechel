import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  reviewSchema,
  reviewObservations,
  type ReviewInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';
import { resolveActor } from './auth-wrapper.js';

export function registerMemReview(server: McpServer, ctx: ToolContext): void {
  server.registerTool('mem_review', {
    description:
      "Review observation lifecycle state. action=list returns observations whose review_after has passed; action=mark_reviewed resets one observation's review_after using its type decay policy.",
    inputSchema: reviewSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = resolveActor(extra, ctx);
      const parsed = reviewSchema.parse(args) as ReviewInput;
      const result = await reviewObservations(ctx.db, ctx.tenantId, actor, parsed);
      return ok(result);
    } catch (e) {
      return error(e);
    }
  });
}
