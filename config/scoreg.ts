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

/**
 * Every scored component, with its maximum (2026-09-25).
 *
 * The rubric in `prompts/scoreg/SKILL.md`, as data, so the application can
 * score part of it itself and add the whole thing up. Components the
 * pre-qualification gate, the watchlist, the sponsor register or the job record
 * already settle are scored in code (`features/scoring/fixed.ts`) and handed to
 * the model as fixed. The model scores only the judgement ones. That is the
 * cost cut: the reasoning the model used to spend walking settled rules was
 * about two thirds of every score's bill.
 *
 * Names are the contract with the model: it must use these exact names for
 * the components it is asked to score. Pillar maxima sum to 100, except Job
 * Relevance at 95, which is how the skill is written; the pillar score is the
 * raw sum, as the model has always computed it.
 *
 * Seniority / Complexity (20) is split in two: the years part is a lookup on the
 * requirement the gate already read, and the enterprise-scale part is a
 * judgement about the JD.
 */
export type ScoreComponentKey =
  | "evidence_tier"
  | "country_pathway"
  | "company_size"
  | "portal"
  | "behavioral"
  | "intent"
  | "domain"
  | "functional"
  | "seniority_years"
  | "enterprise_scale"
  | "location"
  | "role"
  | "experience_fit"
  | "reachability"
  | "posting_age";

export type ScoreComponent = {
  key: ScoreComponentKey;
  pillar: PillarKey;
  name: string;
  max: number;
  /** Only Posting Age goes negative. */
  min: number;
};

export const SCORE_COMPONENTS: readonly ScoreComponent[] = [
  { key: "evidence_tier", pillar: "visa", name: "Evidence Tier", max: 35, min: 0 },
  { key: "country_pathway", pillar: "visa", name: "Country Pathway", max: 10, min: 0 },
  { key: "company_size", pillar: "visa", name: "Company Size / HR Infrastructure", max: 10, min: 0 },
  { key: "portal", pillar: "visa", name: "Visa Portal Source", max: 5, min: 0 },
  { key: "behavioral", pillar: "visa", name: "Behavioral Signals", max: 20, min: 0 },
  { key: "intent", pillar: "visa", name: "Intent Signals", max: 20, min: 0 },
  { key: "domain", pillar: "resume", name: "Domain Match", max: 50, min: 0 },
  { key: "functional", pillar: "resume", name: "Functional PM Match", max: 30, min: 0 },
  { key: "seniority_years", pillar: "resume", name: "Seniority (Years Asked)", max: 15, min: 0 },
  { key: "enterprise_scale", pillar: "resume", name: "Enterprise Scale", max: 5, min: 0 },
  { key: "location", pillar: "relevance", name: "Location", max: 30, min: 0 },
  { key: "role", pillar: "relevance", name: "Role Alignment", max: 30, min: 0 },
  { key: "experience_fit", pillar: "relevance", name: "Experience Fit", max: 15, min: 0 },
  { key: "reachability", pillar: "relevance", name: "Reachability", max: 15, min: 0 },
  { key: "posting_age", pillar: "relevance", name: "Posting Age", max: 5, min: -10 },
];

/** 2b — countries with a named skilled-worker route in the skill. */
export const PATHWAY_COUNTRIES: ReadonlySet<string> = new Set([
  "united kingdom",
  "netherlands",
  "germany",
  "sweden",
  "united arab emirates",
]);

/** Hard overrides: below either floor the job is Skip, whatever the total. */
export const VISA_PILLAR_FLOOR = 20;
export const RESUME_PILLAR_FLOOR = 40;
