import type { WatchlistMatch } from "./lookup";
import { VISA_REASON_LABELS } from "@/features/prequalification/labels";

/**
 * Curated facts handed to ScoreG, so it stops paying to rediscover them
 * (JSV2S1051, JSV2S1156).
 *
 * Both blocks follow the sponsor block's rule: phrased so absence never reads
 * as a negative finding. "Not on the watchlist" means we hold no curated
 * evidence, not that the company refuses to sponsor — and the evidence tier
 * takes a maximum precisely so that distinction costs nothing.
 */

export function watchlistPromptBlock(match: WatchlistMatch | null): string {
  const head = "### Sponsorship watchlist (curated — do not search for this)";

  if (!match) {
    return [
      head,
      "This company is NOT on the watchlist.",
      "That means no curated evidence of past sponsorship exists — it is NOT",
      "evidence that the company does not sponsor. Score the evidence tier on",
      "whatever the register and the posting support, and do not penalise the",
      "company for a record we simply do not hold.",
    ].join("\n");
  }

  return [
    head,
    `${match.name} is on the watchlist at tier ${match.tier} of 5.`,
    match.note ? `Note: ${match.note}` : "",
    match.tier >= 4
      ? "Tier 4-5 is direct evidence of sponsorship having been provided, curated from real relocation cases. This alone reaches Evidence Tier A."
      : "Tier 3 and below is weaker: the company is known to hire internationally, but the sponsorship evidence is not first-party. Tier B at most on this signal alone.",
    "Do NOT run community-sentiment or recency-hire searches for this company.",
    "The watchlist is the curated form of exactly what they would return.",
  ]
    .filter(Boolean)
    .join("\n");
}

type GateDetail = {
  visa?: { reasonCode?: string; reason?: string; evidence?: { text?: string }[] };
  domain?: { primaryDomain?: string | null; score?: number; matchedTerms?: string[] };
} | null;

export function gatePromptBlock(detail: unknown): string {
  const gate = (detail ?? null) as GateDetail;
  const head = "### Pre-qualification verdict (deterministic — do not re-derive)";

  if (!gate?.visa?.reasonCode) {
    return [
      head,
      "No stored verdict for this job — it predates the gate or was uploaded by hand.",
      "Read the posting yourself for sponsorship language, and say that you did.",
    ].join("\n");
  }

  const quoted = gate.visa.evidence?.[0]?.text;

  return [
    head,
    `Sponsorship language: ${VISA_REASON_LABELS[gate.visa.reasonCode] ?? gate.visa.reasonCode}.`,
    gate.visa.reason ? gate.visa.reason : "",
    quoted ? `The sentence this rests on: "${quoted}"` : "",
    gate.domain?.primaryDomain
      ? `Domain: ${gate.domain.primaryDomain} (gate score ${gate.domain.score ?? "?"})${
          gate.domain.matchedTerms?.length
            ? ` on ${gate.domain.matchedTerms.slice(0, 12).join(", ")}`
            : ""
        }.`
      : "Domain: no payments vocabulary matched in the posting.",
    "",
    "A posting that explicitly refused sponsorship would have been rejected",
    "before this call, so you are never scoring one. Silence about visas is the",
    "normal case and is NOT a negative signal.",
  ]
    .filter(Boolean)
    .join("\n");
}
