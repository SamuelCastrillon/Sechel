// Core public API barrel. NO server-only: importing core does not pull the
// server-only guard into a client boundary (the guards live inside db/auth/
// domain/store/fts and only activate when those leaf modules are loaded server-side).
export * from './db';
export * from './auth';
export * from './domain';
