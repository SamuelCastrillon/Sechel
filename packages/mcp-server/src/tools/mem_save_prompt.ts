import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  savePrompt,
  savePromptSchema,
  type SavePromptInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';
import { resolveActor } from './auth-wrapper.js';

export function registerMemSavePrompt(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'mem_save_prompt',
    {
      description:
        "Save a user prompt to persistent memory. Use this to record what the user asked — their intent, questions, and requests — so future sessions have context about the user's goals.",
      inputSchema: savePromptSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = resolveActor(extra, ctx);
        const parsed = savePromptSchema.parse(args) as SavePromptInput;
        const result = await savePrompt(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
