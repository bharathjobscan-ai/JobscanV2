import type { SponsorLicence } from "@/db/schema";

/**
 * The pure half of the sponsor lookup (JSV2S1127).
 *
 * Split from `lookup.ts` so the unit suite can exercise it with no database —
 * `lookup.ts` opens a connection at import time. Same split as
 * `features/ai/cost.ts` (pure) against `queries.ts` (db).
 */

export type SponsorMatchStatus =
  /** Exact match on the registered name, legal form aside. */
  | "confirmed"
  /** Matched only after stripping qualifiers, or several entries matched. */
  | "probable"
  /** Searched and genuinely absent from the register. */
  | "none"
  /** The register has not been loaded, so absence proves nothing. */
  | "unknown";

export type SponsorMatch = {
  status: SponsorMatchStatus;
  /** Every licence considered a match, so a `probable` can be inspected. */
  matches: SponsorLicence[];
  /** How the match was reached, for the audit trail and the prompt. */
  method: "alias" | "exact" | "core" | "none" | "register-empty";
  /** Freshness of the register copy this answer came from. */
  registerFetchedAt: Date | null;
};

/**
 * The sponsor block for the ScoreG prompt.
 *
 * Phrased so the model cannot treat a weak signal as a strong one, and so
 * `unknown` never reads as `none` — the distinction between "not a sponsor" and
 * "we did not check" is the whole reason the visa pillar has a default floor.
 */
export function sponsorPromptBlock(match: SponsorMatch): string {
  const head = "### UK sponsor register (authoritative — do not search for this)";

  if (match.status === "unknown") {
    return [
      head,
      "The local register copy is empty, so sponsorship could NOT be checked.",
      "Treat this as no evidence either way. Do not infer absence.",
    ].join("\n");
  }

  if (match.status === "none") {
    return [
      head,
      `Searched the Register of Licensed Sponsors (Workers), copy dated ${
        match.registerFetchedAt?.toISOString().slice(0, 10) ?? "unknown"
      }.`,
      "This employer has NO entry under any name we could resolve.",
      "This is a real absence from the register, not a failed search.",
    ].join("\n");
  }

  const lines = match.matches.map(
    (m) =>
      `- ${m.organisationName}${m.townCity ? ` (${m.townCity})` : ""} — ${
        m.typeRating ?? "rating unknown"
      }${m.route ? ` · ${m.route}` : ""}`,
  );

  return [
    head,
    `Register copy dated ${match.registerFetchedAt?.toISOString().slice(0, 10)}.`,
    match.status === "confirmed"
      ? "CONFIRMED — this employer holds a sponsor licence:"
      : "PROBABLE — a licence matches after normalising the legal entity name. Treat as strong but not certain:",
    ...lines,
  ].join("\n");
}
