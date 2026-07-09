import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveDb, reviewSchema, type ReviewInput } from '@/modules/core/domain';
import { reviewObservations } from '@/modules/core/domain/store-admin';
import { actorFromAuthInfo } from '@/modules/core/auth';

export function registerMemReview(server: McpServer): void {
  server.registerTool('mem_review', {
    description:
      'Review observation lifecycle state. action=list returns observations whose review_after has passed; action=mark_reviewed resets one observation\'s review_after using its type decay policy.',
    inputSchema: reviewSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = actorFromAuthInfo(extra.authInfo);
      if (!actor) throw new Error('Unauthorized: missing or invalid token');
      const parsed = reviewSchema.parse(args) as ReviewInput;
      const db = await resolveDb();
      const result = await reviewObservations(db, actor, parsed);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  });
}
