import { LENS_WEIGHTS, compositeScore, type LensKey } from "@/config/simg";
import { pageFit } from "@/lib/documents/parse";
import type { SimgEvaluation, SimgRecommendation } from "./types";

/**
 * Applying a SimG worklist — deterministic, no model involved (JSV2S1126).
 *
 * Every edit carries verbatim `before`/`after` text precisely so a revision is
 * literal string substitution. That is what makes accepting an edit free: the
 * alternative is a third billed call to re-write the CV, on every click.
 *
 * The original markdown is never mutated. The CV on screen is *derived* by
 * replaying the accepted set over it, which is what buys undo without keeping
 * version history — the user asked for no history (2026-09-05).
 */

/** A `before` that appears twice cannot be substituted unambiguously. */
function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

export type ValidationFailure = { id: string; reason: string };

/**
 * Discard any recommendation that cannot be applied to this CV.
 *
 * Runs once, at settle time, before the user ever sees the worklist. An item
 * whose anchor text is missing or ambiguous would silently do nothing when
 * accepted, which is worse than never offering it: the score would rise on
 * screen while the document stayed unchanged.
 */
export function validateRecommendations(
  markdown: string,
  recommendations: SimgRecommendation[],
): { valid: SimgRecommendation[]; rejected: ValidationFailure[] } {
  const valid: SimgRecommendation[] = [];
  const rejected: ValidationFailure[] = [];
  // Rule 1 of the independence contract: no two edits may touch the same text.
  const claimed = new Set<string>();

  for (const rec of recommendations) {
    const anchor = rec.kind === "insert" ? rec.anchorAfter : rec.before;

    if (!anchor) {
      rejected.push({
        id: rec.id,
        reason:
          rec.kind === "insert"
            ? "No anchorAfter — nowhere to put the new line."
            : "No before text — nothing to change.",
      });
      continue;
    }

    if (rec.kind !== "delete" && !rec.after) {
      rejected.push({ id: rec.id, reason: "No replacement text." });
      continue;
    }

    const found = occurrences(markdown, anchor);
    if (found === 0) {
      rejected.push({
        id: rec.id,
        reason: "Anchor text is not in the CV — it was paraphrased, not quoted.",
      });
      continue;
    }
    if (found > 1) {
      rejected.push({
        id: rec.id,
        reason: `Anchor text appears ${found} times — the target is ambiguous.`,
      });
      continue;
    }

    if (claimed.has(anchor)) {
      rejected.push({
        id: rec.id,
        reason: "Another recommendation already targets this text.",
      });
      continue;
    }

    claimed.add(anchor);
    valid.push(rec);
  }

  return { valid, rejected };
}

/**
 * Replay the accepted edits over the original CV.
 *
 * Order-independent by construction — the independence rule in SIMG.md forbids
 * two edits from touching the same text — so the result does not depend on the
 * order the user clicked in.
 */
export function applyAccepted(
  original: string,
  recommendations: SimgRecommendation[],
): string {
  let markdown = original;

  for (const rec of recommendations) {
    if (rec.state !== "accepted") continue;

    if (rec.kind === "modify" && rec.before && rec.after) {
      markdown = markdown.replace(rec.before, rec.after);
      continue;
    }

    if (rec.kind === "delete" && rec.before) {
      // Take the whole line with it, so deleting a bullet does not leave a
      // blank one behind and shift the page estimate.
      const line = new RegExp(
        `^.*${rec.before.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*$\\n?`,
        "m",
      );
      markdown = markdown.replace(line, "");
      continue;
    }

    if (rec.kind === "insert" && rec.anchorAfter && rec.after) {
      const index = markdown.indexOf(rec.anchorAfter);
      if (index === -1) continue;
      const lineEnd = markdown.indexOf("\n", index);
      const at = lineEnd === -1 ? markdown.length : lineEnd;
      markdown = `${markdown.slice(0, at)}\n${rec.after}${markdown.slice(at)}`;
    }
  }

  return markdown;
}

export type SimgProjection = {
  /** Composite of the CV as generated, before any edit. */
  generated: number;
  /** Composite of the master resume — what an untailored CV would score. */
  baseline: number;
  /** Composite with the currently accepted edits. Rises as items are accepted. */
  current: number;
  /** Composite if every remaining pending item were also accepted. */
  potential: number;
  acceptedCount: number;
  pendingCount: number;
  discardedCount: number;
  /** True once the derived CV no longer fits one page. */
  overflows: boolean;
  overBy: number;
};

/**
 * The three numbers across the top of the worklist: baseline → generated →
 * potential, with `current` as the live figure that moves.
 *
 * Points are additive because SIMG.md forbids overlapping recommendations. The
 * ceiling is still enforced here: a model that over-prices its worklist cannot
 * push the projection past 100.
 */
export function project(
  evaluation: SimgEvaluation,
  derivedMarkdown: string,
): SimgProjection {
  const lenses = Object.fromEntries(
    (Object.keys(LENS_WEIGHTS) as LensKey[]).map((k) => [
      k,
      evaluation.current[k]?.score ?? 0,
    ]),
  ) as Record<LensKey, number>;

  const generated = compositeScore(lenses);
  const baseline = compositeScore(evaluation.baseline);

  const sum = (state: SimgRecommendation["state"]) =>
    evaluation.recommendations
      .filter((r) => r.state === state)
      .reduce((n, r) => n + r.points, 0);

  const accepted = sum("accepted");
  const pending = sum("pending");
  const fit = pageFit(derivedMarkdown);

  return {
    generated,
    baseline,
    current: Math.min(100, generated + accepted),
    potential: Math.min(100, generated + accepted + pending),
    acceptedCount: evaluation.recommendations.filter((r) => r.state === "accepted").length,
    pendingCount: evaluation.recommendations.filter((r) => r.state === "pending").length,
    discardedCount: evaluation.recommendations.filter((r) => r.state === "discarded")
      .length,
    overflows: !fit.fits,
    overBy: fit.overBy,
  };
}
