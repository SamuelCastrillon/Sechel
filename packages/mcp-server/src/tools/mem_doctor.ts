import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  doctorSchema,
  doctorDiagnostics,
  type DoctorInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';
import { resolveActor } from './auth-wrapper.js';

export function registerMemDoctor(server: McpServer, ctx: ToolContext): void {
  server.registerTool('mem_doctor', {
    description:
      'Run read-only operational diagnostics. Returns structured counts and surface issues.',
    inputSchema: doctorSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = resolveActor(extra, ctx);
      const parsed = doctorSchema.parse(args) as DoctorInput;
      const result = await doctorDiagnostics(ctx.db, ctx.tenantId, actor, parsed);
      return ok(result);
    } catch (e) {
      return error(e);
    }
  });
}
