/**
 * Split a job description around the domain terms the gate matched
 * (JSV2S1152).
 *
 * Pure and separately testable: the highlighting must show *exactly* what
 * `features/prequalification/domain.ts` matched, because the point of the view
 * is to check the gate's reasoning. A near-miss highlight that finds a term the
 * engine did not count would be worse than no highlighting at all.
 */

export type Segment = { text: string; term: string | null };

/** Escape a term for use inside a RegExp. */
function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match on word boundaries so "pay" does not light up inside "payroll".
 *
 * The engine matches phrases the same way (`containsPhrase`), so this stays
 * faithful to it. Terms are sorted longest-first so "cross-border payments"
 * wins over "payments" where both would match at the same position.
 */
export function highlightTerms(text: string, terms: readonly string[]): Segment[] {
  const usable = [...new Set(terms.filter((t) => t.trim().length > 1))].sort(
    (a, b) => b.length - a.length,
  );
  if (usable.length === 0 || !text) return [{ text, term: null }];

  const pattern = new RegExp(`\\b(${usable.map(escape).join("|")})\\b`, "gi");
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ text: text.slice(lastIndex, start), term: null });
    }
    // The canonical term, not the casing the posting happened to use — the
    // tooltip should name the rule that fired.
    const canonical =
      usable.find((t) => t.toLowerCase() === match[0].toLowerCase()) ?? match[0];
    segments.push({ text: match[0], term: canonical });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), term: null });
  }

  return segments;
}

/** How many times each term actually appears — the gate counts a term once. */
export function termFrequency(
  segments: Segment[],
): { term: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const segment of segments) {
    if (!segment.term) continue;
    counts.set(segment.term, (counts.get(segment.term) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}
