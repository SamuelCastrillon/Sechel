// LEAF module: zero imports. Shared normalize helpers.

export function normalizeProject(project: string | null | undefined): string | null {
  if (project === null || project === undefined) return null;
  const trimmed = project.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}

/** Strip <private>…</private> tags from text. */
export function stripPrivateTags(text: string): string {
  return text.replace(/<private>[\s\S]*?<\/private>/g, '');
}
