import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  reviewSchema,
  reviewObservations,
  actorFromAuthInfo,
  type ReviewInput,
} from '@sechel/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';

export function registerMemReview(server: McpServer, ctx: ToolContext): void {
  server.registerTool('mem_review', {
    description:
      "Review observation lifecycle state. action=list returns observations whose review_after has passed; action=mark_reviewed resets one observation's review_after using its type decay policy.",
    inputSchema: reviewSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = actorFromAuthInfo(extra.authInfo);
      if (!actor) return error('Unauthorized: missing or invalid token');
      const parsed = reviewSchema.parse(args) as ReviewInput;
      const result = await reviewObservations(ctx.db, ctx.tenantId, actor, parsed);
      return ok(result);
    } catch (e) {
      return error(e);
    }
  });
}
