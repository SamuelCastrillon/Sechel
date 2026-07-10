/**
 * Read env var with legacy fallback.
 * Reads `name` first; if unset, falls back to `legacyName` with a deprecation warning.
 * If neither is set, returns `fallback`.
 */
export function getEnv(
  name: string,
  legacyName: string,
  fallback?: string,
): string | undefined {
  const val = process.env[name];
  if (val !== undefined && val !== '') return val;

  const legacy = process.env[legacyName];
  if (legacy !== undefined && legacy !== '') {
    console.warn(`[sechel] Using legacy env ${legacyName} — rename to ${name}`);
    return legacy;
  }

  return fallback;
}
