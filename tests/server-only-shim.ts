// Empty shim for the `server-only` package under vitest (node, non-RSC).
// In a React Server Components build, `server-only` resolves to an empty module;
// under vitest we alias it here so importing guarded modules doesn't throw.
export {};
