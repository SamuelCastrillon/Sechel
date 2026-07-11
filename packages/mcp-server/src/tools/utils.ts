import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Create a successful tool result with JSON content.
 */
export function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
  };
}

/**
 * Create an error tool result. Handles Error objects and strings.
 */
export function error(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}
