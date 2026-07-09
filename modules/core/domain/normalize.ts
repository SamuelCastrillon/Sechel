// LEAF module: zero imports. Shared normalize helper used by both core/auth and
// core/domain/store so the logic lives in exactly one place (no duplication,
// no import cycle — it depends on nothing internal).
export function normalizeProject(project: string | null | undefined): string | null {
  if (project === null || project === undefined) return null;
  const trimmed = project.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}
