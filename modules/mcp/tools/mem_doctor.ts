import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveDb, doctorSchema, type DoctorInput } from '@/modules/core/domain';
import { doctorDiagnostics } from '@/modules/core/domain/store-admin';
import { actorFromAuthInfo } from '@/modules/core/auth';

export function registerMemDoctor(server: McpServer): void {
  server.registerTool('mem_doctor', {
    description:
      'Run read-only operational diagnostics. Returns structured counts and surface issues.',
    inputSchema: doctorSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = actorFromAuthInfo(extra.authInfo);
      if (!actor) throw new Error('Unauthorized: missing or invalid token');
      const parsed = doctorSchema.parse(args) as DoctorInput;
      const db = await resolveDb();
      const result = await doctorDiagnostics(db, actor, parsed);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  });
}
