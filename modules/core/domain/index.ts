// Public domain API. NO server-only here: this barrel is safe to touch from a
// client boundary as long as consumers only import the pure pieces (normalize,
// validation, types). The server-only modules (store.ts, fts.ts) are pulled in
// transitively by server code (mcp, route handlers).
export * from './store';
export * from './validation';
export * from './normalize';
export * from './types';
