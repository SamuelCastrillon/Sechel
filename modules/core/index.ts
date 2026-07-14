// Backward-compat re-export barrel.
// Keeps `@/modules/core/...` imports working in Next.js during migration.
// When migration is complete, this barrel is removed and apps import directly from @sechel/core.
export * from '@sechel-mcp/core';
