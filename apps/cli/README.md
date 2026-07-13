# @sechel-mcp/cli

Sechel CLI — run the Sechel persistent memory MCP server locally via stdio or HTTP.

## Install

```bash
npm i -g sechel
```

> **Note:** The package is `@sechel-mcp/cli` but the binary is registered as `sechel`.

## Usage

### Stdio mode (default)

Starts a local SQLite-backed MCP server using stdio transport. Connects to MCP clients (Claude Desktop, VS Code, etc.).

```bash
sechel
```

No arguments, no config required on first run. The database is created automatically at the default path.

### HTTP mode

Starts an HTTP server with a health check endpoint and a Streamable HTTP MCP endpoint.

```bash
sechel start
```

Endpoints:
- `GET /health` — returns `{ "status": "ok" }`
- `POST /mcp` — MCP Streamable HTTP endpoint

Default: `http://localhost:3030`. Configure port and host via environment variables or config file.

### Configuration

The CLI stores its config in a platform-specific directory. On first run, a default config is created automatically.

| Setting | Env | Default |
|---|---|---|
| DB path | `SECHEL_DB_PATH` | Platform config dir |
| HTTP port | `SECHEL_PORT` | `3030` |
| HTTP host | `SECHEL_HOST` | `localhost` |

## API Reference

### `startStdio(): Promise<void>`

Loads config, creates a local SQLite database, and starts the MCP server with `StdioServerTransport`. Used when `sechel` is invoked with no subcommand.

### `startHttp(): Promise<void>`

Loads config, creates a local SQLite database, and starts a Hono HTTP server on the configured port.

### `createApp(db: Kysely<CortexDB>): Hono`

Creates a Hono app with `/health` and `/mcp` endpoints. Exported for testing — does not start the HTTP server.

```ts
import { createDb } from '@sechel-mcp/core';
import { createApp } from '@sechel-mcp/cli';

const db = await createDb({ url: ':memory:' });
const app = createApp(db);

// Test the health endpoint
const res = await app.request('/health');
console.log(await res.json()); // { status: 'ok' }
```

## License

MIT — see [LICENSE](../../LICENSE) at the repo root.
