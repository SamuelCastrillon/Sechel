import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Kysely } from 'kysely';
import type { CortexDB } from '@sechel-mcp/core';

import { registerPing } from './ping.js';
import { registerMemSave } from './mem_save.js';
import { registerMemSearch } from './mem_search.js';
import { registerMemGetObservation } from './mem_get_observation.js';
import { registerMemStats } from './mem_stats.js';
import { registerMemCurrentProject } from './mem_current_project.js';
import { registerMemSuggestTopicKey } from './mem_suggest_topic_key.js';
import { registerMemPin } from './mem_pin.js';
import { registerMemUnpin } from './mem_unpin.js';
import { registerMemSavePrompt } from './mem_save_prompt.js';
import { registerMemSessionStart } from './mem_session_start.js';
import { registerMemSessionEnd } from './mem_session_end.js';
import { registerMemSessionSummary } from './mem_session_summary.js';
import { registerMemUpdate } from './mem_update.js';
import { registerMemDelete } from './mem_delete.js';
import { registerMemTimeline } from './mem_timeline.js';
import { registerMemContext } from './mem_context.js';
import { registerMemJudge } from './mem_judge.js';
import { registerMemCompare } from './mem_compare.js';
import { registerMemReview } from './mem_review.js';
import { registerMemDoctor } from './mem_doctor.js';
import { registerMemMergeProjects } from './mem_merge_projects.js';
import { registerMemCapturePassive } from './mem_capture_passive.js';

export interface ToolContext {
  db: Kysely<CortexDB>;
  tenantId: string;
}

/**
 * Register all 24 tools on the given MCP server.
 * Tools that require auth will check extra.authInfo from the SDK.
 */
export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  registerPing(server);
  registerMemSave(server, ctx);
  registerMemSearch(server, ctx);
  registerMemGetObservation(server, ctx);
  registerMemStats(server, ctx);
  registerMemCurrentProject(server, ctx);
  registerMemSuggestTopicKey(server);
  registerMemPin(server, ctx);
  registerMemUnpin(server, ctx);
  registerMemSavePrompt(server, ctx);
  registerMemSessionStart(server, ctx);
  registerMemSessionEnd(server, ctx);
  registerMemSessionSummary(server, ctx);
  registerMemUpdate(server, ctx);
  registerMemDelete(server, ctx);
  registerMemTimeline(server, ctx);
  registerMemContext(server, ctx);
  registerMemJudge(server, ctx);
  registerMemCompare(server, ctx);
  registerMemReview(server, ctx);
  registerMemDoctor(server, ctx);
  registerMemMergeProjects(server, ctx);
  registerMemCapturePassive(server, ctx);
}
