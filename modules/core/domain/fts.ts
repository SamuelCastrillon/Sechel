import 'server-only';

/** Verbatim port of upstream sanitizeFTS: wrap every word in double quotes. */
export function sanitizeFTS(query: string): string {
  const words = query.trim().split(/\s+/).filter(Boolean);
  return words.map((w) => `"${w.replace(/"/g, '')}"`).join(' ');
}

/** OR semantics variant for match_mode='any': wrap words, join with OR. */
export function sanitizeFTSCandidates(query: string): string {
  const words = query.trim().split(/\s+/).filter(Boolean);
  return words.map((w) => `"${w.replace(/"/g, '')}"`).join(' OR ');
}
