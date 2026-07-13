# @sechel-mcp/mcp-server

MCP server factory for Sechel — registers all 24 persistent memory tools (`mem_*` + `ping`) on an [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) server instance.

## Install

```bash
npm i @sechel-mcp/mcp-server
```

## Quick Start

```ts
import { createDb } from '@sechel-mcp/core';
import { createSechelServer } from '@sechel-mcp/mcp-server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const db = await createDb({ url: 'file:./sechel.db' });
const transport = new StdioServerTransport();

const server = await createSechelServer({
  transport,
  db,
  tenantId: 'default',
});

// Server is connected and ready via stdio
```

**With HTTP transport:**

```ts
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

const transport = new WebStandardStreamableHTTPServerTransport({
  enableJsonResponse: true,
});

const server = await createSechelServer({
  transport,
  db,
  tenantId: 'default',
});

// Handle HTTP requests via transport.handleRequest(request)
```

## API Reference

### `createSechelServer(config: SechelServerConfig): Promise<McpServer>`

Creates an `McpServer`, registers all 24 tools, connects to the given transport, and returns the server.

```ts
interface SechelServerConfig {
  transport: Transport;           // Stdio | StreamableHTTP | InMemory transport
  db: Kysely<CortexDB>;          // Connected Kysely database from @sechel-mcp/core
  tenantId: string;               // Tenant ID for data scoping
  auth?: {
    required: boolean;            // Whether auth is required for tool calls
    requiredScopes?: string[];    // Required OAuth scopes
  };
}
```

### Tools

The server registers these tools (all prefixed with `mem_`):

| Tool | Description |
|---|---|
| `mem_save` | Save a memory observation |
| `mem_search` | FTS5 full-text search across observations |
| `mem_get_observation` | Get full content of a specific observation |
| `mem_context` | Get recent session context |
| `mem_timeline` | Get chronological neighborhood of an observation |
| `mem_update` | Update an existing observation |
| `mem_delete` | Soft (or hard) delete an observation |
| `mem_pin` | Pin an observation |
| `mem_unpin` | Unpin an observation |
| `mem_suggest_topic_key` | Suggest a stable topic_key for upserts |
| `mem_compare` | Persist a semantic verdict between two observations |
| `mem_judge` | Record a verdict on a pending memory conflict |
| `mem_session_start` | Register a new coding session |
| `mem_session_end` | Mark a session as completed |
| `mem_session_summary` | Save an end-of-session summary |
| `mem_stats` | Get observation and session counts |
| `mem_doctor` | Run operational diagnostics |
| `mem_review` | Review observation lifecycle state |
| `mem_capture_passive` | Extract and save learnings from text |
| `mem_save_prompt` | Save a user prompt |
| `mem_current_project` | Detect the current project |
| `mem_merge_projects` | Rename a project across all tables |
| `ping` | Health check (no auth required) |

### Auth

Auth is handled via the MCP SDK's built-in `authInfo` mechanism. The transport may provide validated auth info (OAuth, bearer token, or `InMemoryTransport`'s `authInfo` option). When `auth.required` is `true`, tools return an `Unauthorized` error if no valid auth info is present. `ping` always skips auth.

## License

MIT — see [LICENSE](../../LICENSE) at the repo root.
