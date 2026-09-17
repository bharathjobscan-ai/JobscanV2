/**
 * ScoreG's pillar weights, as TS-as-data (JSV2S1140).
 *
 * Mirrors `prompts/scoreg/SKILL.md`:
 *
 *     Final Score = (Visa x 0.50) + (Resume x 0.30) + (Relevance x 0.20)
 *
 * Held here rather than parsed out of the model's `finalCalculation` string,
 * because the ledger must be able to explain a score even when the model
 * phrased its arithmetic differently — or omitted it. The prompt is the
 * authority on what the weights ARE; this file is how the application reads
 * them without asking.
 *
 * If the skill's weights change, change them here in the same commit.
 */
export const PILLAR_WEIGHTS = {
  visa: 0.5,
  resume: 0.3,
  relevance: 0.2,
} as const;

export type PillarKey = keyof typeof PILLAR_WEIGHTS;

export const PILLAR_LABELS: Record<PillarKey, string> = {
  visa: "Visa Intelligence",
  resume: "Resume Match",
  relevance: "Job Relevance",
};

/**
 * Map a pillar name as the model wrote it onto a known key.
 *
 * The model is asked for "Visa Intelligence", "Resume Match" and "Job
 * Relevance", but phrasing drifts between runs. Matching on a distinctive
 * substring is more durable than an equality test, and an unrecognised pillar
 * is returned as null rather than being forced into a bucket it may not belong
 * to — a mis-bucketed line would silently move points between pillars.
 */
export function pillarKeyFor(name: string): PillarKey | null {
  const n = name.toLowerCase();
  if (n.includes("visa") || n.includes("sponsor")) return "visa";
  if (n.includes("resume") || n.includes("cv match")) return "resume";
  if (n.includes("relevance") || n.includes("job fit")) return "relevance";
  return null;
}
