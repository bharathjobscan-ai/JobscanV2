import type { SectionId, TierId } from "@/config/prequalification";
import type {
  FilterStatus,
  PrequalDecision,
  PrequalFilter,
} from "@/lib/config/constants";
import type { RoleTier } from "@/config/prequalification/roles";
import type { AffinityMatch, WatchlistMatch } from "@/features/companies/lookup";
import type { VisaResult } from "./visa";

/**
 * The pre-qualification contract (PRD §13, §14, §18).
 *
 * Every filter reports not just its verdict but the rule that produced it and
 * the evidence it matched, because the whole point of a deterministic gate is
 * that you can look at a rejected job and see exactly which rule rejected it.
 * A gate you cannot audit is one you stop trusting and then stop using.
 */

/** The job as the engine sees it. Deliberately not the Drizzle row type. */
export type PrequalJob = {
  title: string;
  company?: string | null;
  location?: string | null;
  country?: string | null;
  description?: string | null;
};

export type RoleRule =
  | "EXCLUDED_ROLE"
  | "JUNIOR_ROLE"
  | "TARGET_ROLE"
  | "NO_MATCH";

export type RoleResult = {
  status: FilterStatus;
  rule: RoleRule;
  /** The canonical role this title resolved to, when one was found. */
  matchedRole: string | null;
  tier: RoleTier | null;
  /** The title after alias and level-suffix normalisation. */
  normalizedTitle: string;
  reason: string;
};

export type DomainSignal = {
  term: string;
  section: SectionId;
  tier: TierId;
  weight: number;
};

export type DomainResult = {
  status: FilterStatus;
  /**
   * Set when the company's payments affinity changed the verdict
   * (JSV2S1167). The raw keyword result is kept in `rawStatus` so the override
   * is auditable rather than invisible.
   */
  affinity?: AffinityMatch | null;
  rawStatus?: FilterStatus;
  primaryDomain: TierId | null;
  score: number;
  matchedTerms: string[];
  signals: DomainSignal[];
  /** Terms suppressed by a restriction rule, kept so the decision is auditable. */
  suppressed: { term: string; why: string }[];
  reason: string;
};

export type ExperienceRule =
  | "WITHIN_RANGE"
  | "BELOW_FLOOR"
  | "ABOVE_CEILING"
  | "NOT_STATED";

export type ExperienceResult = {
  status: FilterStatus;
  rule: ExperienceRule;
  candidateYears: number;
  requiredMin: number | null;
  requiredMax: number | null;
  /** The JD phrase the requirement was read from, for auditing the regex. */
  matchedPhrase: string | null;
  reason: string;
};

export type LocationRule =
  | "TARGET_COUNTRY"
  | "TARGET_REGION"
  | "REMOTE_TARGET"
  | "NON_TARGET_COUNTRY"
  | "UNRESOLVED";

export type LocationResult = {
  status: FilterStatus;
  rule: LocationRule;
  city: string | null;
  country: string | null;
  region: string | null;
  isRemote: boolean;
  isHybrid: boolean;
  /** JSV2S1138 — drives the UI highlight. */
  preferredCity: string | null;
  reason: string;
};

export type PreQualificationResult = {
  decision: PrequalDecision;
  /** Which filter forced a REJECT, or held the job back from PASS. */
  decidedBy: PrequalFilter | null;
  reason: string;
  role: RoleResult;
  domain: DomainResult;
  experience: ExperienceResult;
  location: LocationResult;
  visa: VisaResult;
  /**
   * The sponsorship watchlist (JSV2S1162).
   *
   * A SIGNAL, NOT A FILTER. It can never reject and a miss is simply no bump,
   * which is why it sits beside the filters rather than among them — if it were
   * a sixth pillar, "all pillars passed" would mean something different from
   * what it means for the other five.
   */
  watchlist: WatchlistMatch | null;
  /** Config fingerprint, so stale verdicts are findable after a config change. */
  configVersion: string;
  evaluatedAt: string;
};

export type FilterResults = Pick<
  PreQualificationResult,
  "role" | "domain" | "experience" | "location" | "visa"
>;

/**
 * Evaluation order, which is the owner's priority order (2026-09-19).
 *
 * It does not change what is computed — every filter runs on every job — but it
 * decides which filter is NAMED as the deciding one, and that name is what the
 * queue is filtered and tuned by.
 */
export const FILTER_ORDER: readonly PrequalFilter[] = [
  "domain",
  "visa",
  "role",
  "location",
  "experience",
] as const;

export type { FilterStatus, PrequalDecision, PrequalFilter };
