import {
  PILLAR_LABELS,
  PILLAR_WEIGHTS,
  RESUME_PILLAR_FLOOR,
  SCORE_COMPONENTS,
  VISA_PILLAR_FLOOR,
  type PillarKey,
  type ScoreComponent,
} from "@/config/scoreg";
import type { JobScoreAnalysis, ScoreLineItem } from "@/db/schema";

/**
 * Add a score up in code (2026-09-25).
 *
 * The model now scores only the judgement components; the rest arrive fixed
 * from `fixedScoring`. This merges the two into one breakdown and computes the
 * pillars, the weighted total and the overrides, so the total is arithmetic
 * rather than something the model is trusted to have added up.
 *
 * Tolerant of the model, because it is a model: component names are matched
 * loosely, several lines for one component are summed, each component is
 * clamped to its own range, a fixed component the model scored anyway is
 * ignored, and an open component it forgot scores 0 and is reported as an
 * exception rather than silently absent.
 *
 * Pure. Tested in tests/unit/scoring-finalise.test.ts.
 */

export type FinalScore = {
  score: number;
  /** True when a hard override applies: the job is Skip whatever the total. */
  overrideReject: boolean;
  analysis: JobScoreAnalysis;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Which open component a model line is about, if any. */
function matchComponent(name: string, open: ScoreComponent[]): ScoreComponent | null {
  const n = norm(name);
  // Exact first, then containment either way ("Behavioral Signals - Community"
  // is Behavioral Signals; "Seniority" alone is the years part).
  return (
    open.find((c) => norm(c.name) === n) ??
    open.find((c) => n.includes(norm(c.name)) || norm(c.name).includes(n)) ??
    open.find((c) => n.includes(norm(c.name.split(/[ /(]/)[0]))) ??
    null
  );
}

export function finaliseScore(
  fixed: ScoreLineItem[],
  model: JobScoreAnalysis | undefined,
): FinalScore {
  const fixedNames = new Set(fixed.map((l) => l.component));
  const open = SCORE_COMPONENTS.filter((c) => !fixedNames.has(c.name));
  const modelLines = Array.isArray(model?.breakdown) ? model.breakdown : [];

  const scored = new Map<string, { awarded: number; reasons: string[] }>();
  for (const l of modelLines) {
    if (typeof l.awarded !== "number") continue;
    const c = matchComponent(l.component ?? "", open);
    if (!c) continue;
    const acc = scored.get(c.key) ?? { awarded: 0, reasons: [] };
    acc.awarded += l.awarded;
    if (l.reason) acc.reasons.push(l.reason);
    scored.set(c.key, acc);
  }

  const exceptions = [...(model?.exceptions ?? [])];
  const modelScored: ScoreLineItem[] = open.map((c) => {
    const hit = scored.get(c.key);
    if (!hit) exceptions.push(`${c.name} was not scored by the model and counts as 0.`);
    return {
      pillar: PILLAR_LABELS[c.pillar],
      component: c.name,
      awarded: Math.min(c.max, Math.max(c.min, hit?.awarded ?? 0)),
      max: c.max,
      reason: hit?.reasons.join(" ") || (hit ? undefined : "Not scored."),
    };
  });

  // Catalogue order, so the table reads pillar by pillar however it arrived.
  const byName = new Map([...fixed, ...modelScored].map((l) => [l.component, l]));
  const breakdown = SCORE_COMPONENTS.map((c) => byName.get(c.name)).filter(
    (l): l is ScoreLineItem => l !== undefined,
  );

  const pillar = (key: PillarKey) =>
    Math.min(
      100,
      Math.max(
        0,
        breakdown
          .filter((l) => l.pillar === PILLAR_LABELS[key])
          .reduce((n, l) => n + l.awarded, 0),
      ),
    );
  const visa = pillar("visa");
  const resume = pillar("resume");
  const relevance = pillar("relevance");

  const exact =
    visa * PILLAR_WEIGHTS.visa + resume * PILLAR_WEIGHTS.resume + relevance * PILLAR_WEIGHTS.relevance;
  const score = Math.round(exact);

  let overrideReject = false;
  if (visa < VISA_PILLAR_FLOOR) {
    overrideReject = true;
    exceptions.push(`Visa pillar ${visa} is below ${VISA_PILLAR_FLOOR}: Skip regardless of the total.`);
  }
  if (resume < RESUME_PILLAR_FLOOR) {
    overrideReject = true;
    exceptions.push(`Resume match ${resume} is below ${RESUME_PILLAR_FLOOR}: Skip regardless of the total.`);
  }

  const fmt = (n: number) => String(Math.round(n * 10) / 10);
  return {
    score,
    overrideReject,
    analysis: {
      ...model,
      breakdown,
      finalCalculation: `(${visa} x 0.50) + (${resume} x 0.30) + (${relevance} x 0.20) = ${fmt(exact)}`,
      exceptions,
    },
  };
}
