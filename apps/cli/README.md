# @sechel-mcp/cli

Sechel CLI — run the Sechel persistent memory MCP server locally via stdio.

## Install

```bash
npm i -g sechel
```

> **Note:** The package is `@sechel-mcp/cli` but the binary is registered as `sechel`.

## Usage

```bash
sechel
```

No arguments, no config required on first run. Starts a local SQLite-backed MCP server using stdio transport. Connects directly to MCP clients (Claude Desktop, VS Code, OpenCode, etc.).

The database is created automatically at `~/.config/sechel/sechel.db`.

## Configuration

| Setting | Env | Default |
|---|---|---|
| DB path | `SECHEL_DB_PATH` | `~/.config/sechel/sechel.db` |

All config is stored in `~/.config/sechel/config.json` and created automatically on first run.

## API Reference

### `startStdio(): Promise<void>`

Loads config, creates a local SQLite database, and starts the MCP server with `StdioServerTransport`. Called when `sechel` is invoked with no subcommand.

## License

MIT — see [LICENSE](../../LICENSE) at the repo root.
