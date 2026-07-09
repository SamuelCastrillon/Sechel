import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveDb, capturePassiveSchema, type CapturePassiveInput } from '@/modules/core/domain';
import { capturePassive } from '@/modules/core/domain/store-admin';
import { actorFromAuthInfo } from '@/modules/core/auth';

export function registerMemCapturePassive(server: McpServer): void {
  server.registerTool('mem_capture_passive', {
    description:
      'Extract and save structured learnings from text output. Parses "## Key Learnings" or "## Aprendizajes Clave" sections and saves each item as a separate observation.',
    inputSchema: capturePassiveSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = actorFromAuthInfo(extra.authInfo);
      if (!actor) throw new Error('Unauthorized: missing or invalid token');
      const parsed = capturePassiveSchema.parse(args) as CapturePassiveInput;
      const db = await resolveDb();
      const result = await capturePassive(db, actor, parsed);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  });
}
