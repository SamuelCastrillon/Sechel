# JUDGMENT-DAY VERDICT — mcp

VERDICT: PARTIAL-TRUST (2026-07-08)
Applies to: Sechel (Next.js 15 App Router + `mcp-handler` Streamable HTTP)

## Trusted for (transport-agnostic)
- Tool schema/input design (Zod/JSON-Schema, clear descriptions, enums).
- Input validation + sanitization before use.
- Error handling: structured errors, never leak internals, `console.error` not `stdout`.
- Pagination for list-style tool results.
- Security basics: auth boundary awareness, no secrets in logs.

## NOT APPLICABLE — DO NOT FOLLOW
- STDIO transport (`StdioServerTransport`, `claude_desktop_config.json`).
- SSE / FastAPI HTTP server bootstrap.
- Raw `@modelcontextprotocol/sdk` Server bootstrap in app/api/mcp/route.ts.
Sechel uses `mcp-handler` for Streamable HTTP. Rewriting transport is OUT OF
SCOPE and risks regressions in working code. The immediate SDD work is schema +
mem_* tools, NOT the MCP transport.

## Why partial
Skill is Claude-MPM / STDIO / Claude-Desktop centric and never mentions mcp-handler
or Next.js route handlers. ~20% is reusable; the rest is noise/misleading here.
