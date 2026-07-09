// LEAF module: zero imports. Shared normalize helpers used by core/auth and
// core/domain/store so the logic lives in exactly one place (no duplication,
// no import cycle — it depends on nothing internal).

export function normalizeProject(project: string | null | undefined): string | null {
  if (project === null || project === undefined) return null;
  const trimmed = project.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Strip <private>…</private> tags from text.
 * Used by saveObservation, updateObservation, and any domain function that
 * stores user-supplied content. Centralised here so every writer goes through
 * the same sanitisation path.
 */
export function stripPrivateTags(text: string): string {
  return text.replace(/<private>[\s\S]*?<\/private>/g, '');
}
