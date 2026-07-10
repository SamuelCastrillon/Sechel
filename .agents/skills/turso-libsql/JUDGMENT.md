# JUDGMENT-DAY VERDICT — turso-libsql

VERDICT: PARTIAL-TRUST (2026-07-08)
Applies to: Sechel (uses @libsql/client on Turso Cloud, FTS5, Vercel serverless)

## Trusted for
- Connection setup: `createClient({ url, authToken })` — matches lib/db.ts exactly.
- Serverless protocol: use `https://` not `libsql://` — matches docs/engram-query-reference.md.
- General `@libsql/client` method vocabulary, batch transactions.

## DO NOT use as schema authority
- This skill has NO FTS5 trigger/DDL syntax and NO multi-tenant design.
- The AUTHORITATIVE source for schema + FTS5 is: `docs/engram-query-reference.md`
  (CREATE VIRTUAL TABLE ... USING fts5(...), bm25(), MATCH, 3 sync triggers).
- Vector search (F32_BLOB) is OUT OF SCOPE for slice 1 — ignore to avoid scope creep.

## Why partial
Directionally correct on stack, but conceptual only. An implementer gets zero
copy-pasteable schema. Always verify DDL against the real Turso Cloud backend.
