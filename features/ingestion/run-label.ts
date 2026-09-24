/**
 * How a fetch is named wherever it is offered as a choice (2026-09-24).
 *
 * "linkedin · 2026-09-24 · 00356fc9" told you when a run happened and nothing
 * about what it went looking for. With eight locations a night, the location is
 * the part that distinguishes one run from its seven siblings — and it is the
 * part you actually remember.
 *
 * Defined once because three surfaces offer this choice: the applications
 * filter, the review filter and the pipeline table. Three copies would drift,
 * and a run labelled differently in two places reads as two runs.
 */

/** The city out of a stored run's params, where it recorded one. */
export function runLocation(params: unknown): string | null {
  if (!params || typeof params !== "object") return null;
  const p = params as { locations?: unknown; file?: unknown; replayOf?: unknown };

  const first = Array.isArray(p.locations) ? p.locations[0] : undefined;
  if (typeof first === "string" && first.trim()) {
    // "London, United Kingdom" → "London". The country is already implied by
    // the city and only costs width in a select.
    return first.split(",")[0]!.trim();
  }

  // Uploads and replays have no location but are worth distinguishing from a
  // scheduled fetch that simply failed to record one.
  if (typeof p.file === "string") return "upload";
  if (typeof p.replayOf === "string") return "replay";
  return null;
}

export function runLabel(input: {
  id: string;
  source: string | null;
  startedAt: Date | null;
  params: unknown;
}): string {
  const where = runLocation(input.params);
  return [
    input.source ?? "unknown",
    where,
    input.startedAt ? input.startedAt.toISOString().slice(0, 10) : "—",
    input.id.slice(0, 8),
  ]
    .filter(Boolean)
    .join(" · ");
}
