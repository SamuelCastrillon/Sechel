import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  doctorSchema,
  doctorDiagnostics,
  actorFromAuthInfo,
  type DoctorInput,
} from '@sechel/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';

export function registerMemDoctor(server: McpServer, ctx: ToolContext): void {
  server.registerTool('mem_doctor', {
    description:
      'Run read-only operational diagnostics. Returns structured counts and surface issues.',
    inputSchema: doctorSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = actorFromAuthInfo(extra.authInfo);
      if (!actor) return error('Unauthorized: missing or invalid token');
      const parsed = doctorSchema.parse(args) as DoctorInput;
      const result = await doctorDiagnostics(ctx.db, ctx.tenantId, actor, parsed);
      return ok(result);
    } catch (e) {
      return error(e);
    }
  });
}
