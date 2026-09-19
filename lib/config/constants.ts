/**
 * Shared domain vocabulary for JobScanV2.
 *
 * Pure constants only — no env access — so this is safe to import from client
 * components. See docs/decisions/ for why several of these are stored as free
 * text in Postgres rather than as pg enums.
 */

// ---------------------------------------------------------------------------
// Application lifecycle (D2)
// ---------------------------------------------------------------------------

/**
 * Resolved from a conflict across the source documents: Application
 * Management.md naming, plus `offer` restored from the PRD. Conversion Rate
 * (Application Analytics §4) has no terminal success state without it.
 *
 * `deemed_pending` is deliberately absent — it is derived, never stored (C2).
 */
export const APPLICATION_STATUSES = [
  "ready_to_apply",
  "applied",
  "shortlisted",
  "interview",
  "offer",
  "rejected_application",
  "rejected_screening",
  "rejected_interview",
  "rejected_visa",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  ready_to_apply: "Ready to Apply",
  applied: "Applied",
  shortlisted: "Shortlisted",
  interview: "Interview",
  offer: "Offer",
  rejected_application: "Rejected — Application",
  rejected_screening: "Rejected — Screening",
  rejected_interview: "Rejected — Interview",
  rejected_visa: "Rejected — Visa",
};

/** Statuses where the application is live with an employer. */
export const ACTIVE_STATUSES: readonly ApplicationStatus[] = [
  "applied",
  "shortlisted",
  "interview",
];

/** Terminal statuses. */
export const CLOSED_STATUSES: readonly ApplicationStatus[] = [
  "offer",
  "rejected_application",
  "rejected_screening",
  "rejected_interview",
  "rejected_visa",
];

/** Statuses that count as a rejection, for the future Rejection Analysis. */
export const REJECTION_STATUSES: readonly ApplicationStatus[] = [
  "rejected_application",
  "rejected_screening",
  "rejected_interview",
  "rejected_visa",
];

export function isClosed(status: ApplicationStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Dashboard views (Application Management.md §3)
// ---------------------------------------------------------------------------

export const APPLICATION_VIEWS = [
  "ready",
  "active",
  "pending",
  "closed",
  "all",
] as const;

export type ApplicationView = (typeof APPLICATION_VIEWS)[number];

export const VIEW_LABELS: Record<ApplicationView, string> = {
  ready: "Ready to Apply",
  active: "Applied / Active",
  pending: "Pending",
  closed: "Closed",
  all: "All Applications",
};

// ---------------------------------------------------------------------------
// Referral (JSV2S1086–1088)
// ---------------------------------------------------------------------------

export const REFERRAL_STATUSES = [
  "not_needed",
  "needed",
  "requested",
  "secured",
] as const;

export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const REFERRAL_LABELS: Record<ReferralStatus, string> = {
  not_needed: "Not Needed",
  needed: "Needed",
  requested: "Requested",
  secured: "Secured",
};

// ---------------------------------------------------------------------------
// Match category — ScoreG decision bands (C3, resolved 2026-08-29)
// ---------------------------------------------------------------------------

/**
 * The bands defined in prompts/scoreg/SKILL.md. ScoreG is the authority on
 * scoring, so its vocabulary wins over the PRD's earlier
 * Perfect / Dicey / Rejection Pool wording.
 *
 * Derived from the numeric score in code (see `matchCategoryFor`) rather than
 * asked of the model: it is a pure function of the score, so deriving it is
 * deterministic, free, and cannot drift between runs.
 */
export const MATCH_CATEGORIES = [
  "priority_apply",
  "apply",
  "referral_only",
  "reject",
  /**
   * Passed the gate at a known sponsor, and deliberately not scored
   * (JSV2S1168).
   *
   * An ENUM, not a placeholder number. `matchCategoryFor` derives the band as a
   * pure function of the score, so stamping something like 80 would manufacture
   * an "Apply" verdict and a referral recommendation out of arithmetic nobody
   * performed, then sort it against real scores and average it into spend
   * reporting. A category cannot be arithmetic'd by accident.
   *
   * The pattern is ScoreG's own: "Source = Recruiter Inbound → skip scoring
   * entirely, auto-classify as PRIORITY" assigns a category, never a score.
   */
  "gate_qualified",
] as const;

export type MatchCategory = (typeof MATCH_CATEGORIES)[number];

export const MATCH_LABELS: Record<MatchCategory, string> = {
  priority_apply: "Strong Apply",
  apply: "Apply",
  referral_only: "Referral Only",
  reject: "Skip it",
  gate_qualified: "Gate qualified",
};

/** What the band means, shown as a tooltip. */
export const MATCH_HINTS: Record<MatchCategory, string> = {
  priority_apply: "85+ · Apply immediately and trigger outreach",
  apply: "70-84 · Apply and seek a referral in parallel",
  referral_only: "55-69 · Apply only if a referral is available",
  reject: "Below 55 · Do not apply",
  gate_qualified: "Not scored · known sponsor, every filter passed",
};

/**
 * ScoreG's decision bands, applied to the final weighted score.
 *
 * Never returns `gate_qualified`: that state means no score exists, and this
 * function's whole contract is that the band follows from one.
 */
export function matchCategoryFor(score: number | null): MatchCategory | null {
  if (score === null || Number.isNaN(score)) return null;
  if (score >= 85) return "priority_apply";
  if (score >= 70) return "apply";
  if (score >= 55) return "referral_only";
  return "reject";
}

/** Referral is the differentiator in the 55-84 range. */
export function referralAdvised(score: number | null): boolean {
  return score !== null && score >= 55 && score < 85;
}

// ---------------------------------------------------------------------------
// Ingestion (JSV2S1031–1034)
// ---------------------------------------------------------------------------

export const JOB_SOURCES = [
  "linkedin",
  "reed",
  "adzuna",
  "jooble",
  "visasponsor",
  "career_site",
  "referral",
  "recruiter",
  "networking",
  "other",
] as const;

export type JobSource = (typeof JOB_SOURCES)[number];

/**
 * ScoreG's Reachability scale (Pillar 3D, 0-15). Manual input by design —
 * how you can actually reach a human about this role.
 */
export const REACHABILITY_LEVELS = [
  "referral",
  "recruiter_contact",
  "careers_page",
  "generic_portal",
] as const;

export type ReachabilityLevel = (typeof REACHABILITY_LEVELS)[number];

export const REACHABILITY_LABELS: Record<ReachabilityLevel, string> = {
  referral: "Referral available (15)",
  recruiter_contact: "Recruiter/HM contactable on LinkedIn (10)",
  careers_page: "Company careers page, direct apply (5)",
  generic_portal: "Generic portal only — Workday/Taleo (2)",
};

export const INGESTION_METHODS = ["manual_upload", "api", "watcher"] as const;
export type IngestionMethod = (typeof INGESTION_METHODS)[number];

// ---------------------------------------------------------------------------
// Ingestion runs (JSV2S1010–1015)
// ---------------------------------------------------------------------------

/** What started a run. Scheduled runs are JSV2S1016; manual is today. */
export const INGESTION_TRIGGERS = ["manual_upload", "scheduled", "backfill"] as const;
export type IngestionTrigger = (typeof INGESTION_TRIGGERS)[number];

/**
 * `partial` is the important one (JSV2S1013): a run where some rows or some
 * sources failed and the rest still landed. Collapsing that into `failed` would
 * hide successful work; collapsing it into `succeeded` would hide the failures.
 */
export const INGESTION_RUN_STATUSES = [
  "running",
  "succeeded",
  "partial",
  "failed",
] as const;
export type IngestionRunStatus = (typeof INGESTION_RUN_STATUSES)[number];

export const INGESTION_RUN_LABELS: Record<IngestionRunStatus, string> = {
  running: "Running",
  succeeded: "Succeeded",
  partial: "Partial — some rows failed",
  failed: "Failed",
};

/** Pipeline stages, so a log line or a failure says where it happened. */
export const INGESTION_STAGES = [
  "fetch",
  "map",
  "validate",
  "dedupe",
  "prequalify",
  "persist",
] as const;
export type IngestionStage = (typeof INGESTION_STAGES)[number];

// ---------------------------------------------------------------------------
// Pre-qualification (JSV2S1037, 1038, 1054, 1055, 1056)
// ---------------------------------------------------------------------------

/**
 * The pre-qualification axis — conflict C3, resolved 2026-09-04.
 *
 * C3 recorded three competing vocabularies for what everyone read as one axis.
 * It was always **two**: this one answers "is this job worth spending money
 * on?" before any AI runs, and `MATCH_CATEGORIES` answers "how good is it?"
 * after ScoreG has run. They are not alternatives and never were.
 *
 * The PRD's Perfect/Dicey/Rejection Pool and JSV2S1052's Absolute/Relative/No
 * Match are both superseded.
 */
export const PREQUALIFICATION_DECISIONS = ["pass", "review", "reject"] as const;
export type PrequalDecision = (typeof PREQUALIFICATION_DECISIONS)[number];

export const PREQUALIFICATION_LABELS: Record<PrequalDecision, string> = {
  pass: "Qualified",
  review: "Needs review",
  reject: "Screened out",
};

/**
 * Per-filter verdict. `unknown` is load-bearing: a posting that simply does not
 * state its location must not be rejected for it, so an absent signal is
 * distinct from a contradicting one.
 */
export const FILTER_STATUSES = ["pass", "fail", "unknown"] as const;
export type FilterStatus = (typeof FILTER_STATUSES)[number];

export const PREQUAL_FILTERS = [
  "domain",
  "visa",
  "role",
  "location",
  "experience",
] as const;
export type PrequalFilter = (typeof PREQUAL_FILTERS)[number];

export const PREQUAL_FILTER_LABELS: Record<PrequalFilter, string> = {
  domain: "Domain",
  visa: "Visa language",
  role: "Role",
  location: "Location",
  experience: "Experience",
};

/**
 * Which filters are allowed to reject on their own (ADR-0006, revised
 * 2026-09-19).
 *
 * The gate's original rule was uniform — any FAIL rejects — because four
 * filters of equal confidence made it uniform. With five of unequal confidence
 * it over-rejects, and the Axon rejection was exactly that shape: a title
 * reading "Senior Product Manager" thrown away on a years figure.
 *
 * Domain, visa language and a recognised non-target country are confident
 * facts. Role and experience are arguable, so their FAIL is a review, not a
 * rejection — the cost of being wrong there is one click, and the cost of being
 * wrong the other way is a job never seen again.
 */
export const REJECTING_FILTERS: readonly PrequalFilter[] = [
  "domain",
  "visa",
  "location",
] as const;

/**
 * Roll individual filter verdicts into one decision.
 *
 * Keeping this next to the vocabulary rather than inside the engine means the
 * UI can explain a decision without importing the engine.
 */
export function prequalDecisionFor(
  byFilter: Readonly<Record<PrequalFilter, FilterStatus>>,
): PrequalDecision {
  if (REJECTING_FILTERS.some((f) => byFilter[f] === "fail")) return "reject";
  return PREQUAL_FILTERS.every((f) => byFilter[f] === "pass") ? "pass" : "review";
}

/**
 * JSV2S1040 — how an observed job relates to what is already stored.
 *
 * `duplicate` means seen again unchanged; `updated` means the posting itself
 * changed; `reposted` means the employer listed it afresh. The last two are
 * only distinguishable with repeat observation, which is why first/last seen
 * timestamps shipped in Phase 1 (JSV2S1041).
 */
export const JOB_LIFECYCLE_STATES = [
  "new",
  "duplicate",
  "updated",
  "reposted",
] as const;
export type JobLifecycleState = (typeof JOB_LIFECYCLE_STATES)[number];

// ---------------------------------------------------------------------------
// Attempts (JSV2S1094–1096)
// ---------------------------------------------------------------------------

export const APPLICATION_CHANNELS = [
  "company_site",
  "linkedin",
  "email",
  "referral",
  "other",
] as const;

export type ApplicationChannel = (typeof APPLICATION_CHANNELS)[number];

// ---------------------------------------------------------------------------
// Documents & AI (JSV2S1078–1081)
// ---------------------------------------------------------------------------

export const DOCUMENT_TYPES = ["resume", "cover_letter", "score_report"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  resume: "Tailored Resume",
  cover_letter: "Cover Letter",
  score_report: "Score Analysis",
};

export const AI_TASK_TYPES = [
  "score",
  "tailor_cv",
  "cover_letter",
  "simg",
] as const;
export type AiTaskType = (typeof AI_TASK_TYPES)[number];

export const AI_TASK_LABELS: Record<AiTaskType, string> = {
  score: "Job Score",
  tailor_cv: "Tailored Resume",
  cover_letter: "Cover Letter",
  simg: "CV Evaluation",
};

/**
 * Which document a completed AI task produces.
 *
 * Partial since JSV2S1058: `simg` is the first task that produces no document.
 * It evaluates one — its output is a worklist stored against the resume it
 * read, not a deliverable of its own. Code that settles a result must treat a
 * missing entry as "no document", not as a bug.
 */
export const AI_TASK_DOCUMENT: Partial<Record<AiTaskType, DocumentType>> = {
  score: "score_report",
  tailor_cv: "resume",
  cover_letter: "cover_letter",
};

/**
 * Tasks the user starts from the workspace. `simg` is deliberately absent: it
 * is mandatory and automatic (JSV2S1058), triggered after a CV generation
 * rather than offered as a button.
 */
export const MANUAL_AI_TASKS: readonly AiTaskType[] = [
  "score",
  "tailor_cv",
  "cover_letter",
];

export const AI_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;

export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

// ---------------------------------------------------------------------------
// Timeline (JSV2S1084 + JSV2S1097)
// ---------------------------------------------------------------------------

export const EVENT_TYPES = [
  "application_created",
  "status_changed",
  "document_generated",
  "referral_updated",
  "attempt_created",
  "note_added",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// Next action (Application Management.md §6 — always emphasise the next action)
// ---------------------------------------------------------------------------

export function nextAction(input: {
  status: ApplicationStatus;
  referralStatus: ReferralStatus;
  hasResume: boolean;
  hasScore: boolean;
  isIncomplete: boolean;
}): string {
  if (input.isIncomplete) return "Add job description";
  if (!input.hasScore) return "Generate job score";

  switch (input.status) {
    case "ready_to_apply":
      if (input.referralStatus === "needed") return "Request referral";
      if (!input.hasResume) return "Generate resume";
      return "Review and apply";
    case "applied":
      return "Await response";
    case "shortlisted":
      return "Prepare for screening";
    case "interview":
      return "Prepare interview material";
    case "offer":
      return "Review offer";
    default:
      return "Closed — review learnings";
  }
}
