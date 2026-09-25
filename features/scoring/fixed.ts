import { CITIES } from "@/config/cities";
import {
  PATHWAY_COUNTRIES,
  SCORE_COMPONENTS,
  type ScoreComponent,
  type ScoreComponentKey,
} from "@/config/scoreg";
import type { ScoreLineItem } from "@/db/schema";
import { hasLocalSponsorRegister } from "@/features/ai/grounding";
import { PILLAR_LABELS } from "@/config/scoreg";

/**
 * The ScoreG components the application can score without a model
 * (2026-09-25, owner's cost target of ₹10 a score including GST).
 *
 * A job reaches ScoreG only after the gate has read its location, its
 * experience requirement and its visa language, and after the watchlist and
 * the sponsor register have been looked up. Every component those facts settle
 * is scored here and handed to the model as fixed, so the model spends its
 * reasoning only on judgement: domain fit, PM coverage, company size, search
 * evidence, role alignment.
 *
 * EVERY RULE HERE IS THE SKILL'S OWN, calibrated against the 14 scores the
 * model produced. Where the model was consistent (Location 30 in a fetched
 * city, Country Pathway 10 in the UK) this reproduces it. Where it was not
 * (Reachability scored 5, 2 and 0 on the same "not provided"), this picks the
 * value it chose most often, and the component stops varying between runs.
 *
 * A component is left to the model whenever the facts do not settle it: no
 * gate verdict, an experience requirement the gate could not read, or an
 * evidence tier outside the UK, where a search can still find a sponsor
 * register we do not hold.
 *
 * Pure: no database, no network. Tested in tests/unit/scoring-fixed.test.ts.
 */

export type ScoringFacts = {
  title: string;
  /** Lower-case country, from the gate where it resolved one. */
  country: string | null;
  preferredCity: string | null;
  locationRule: string | null;
  isRemote: boolean;
  experience: {
    rule: string | null;
    requiredMin: number | null;
    requiredMax: number | null;
  } | null;
  visaReasonCode: string | null;
  watchlistTier: number | null;
  sponsorStatus: "confirmed" | "probable" | "none" | "unknown";
  source: string | null;
  postedAt: string | Date | null;
  reachability: string | null;
  today: Date;
};

export type FixedScoring = {
  /** Components scored here, as breakdown lines. */
  fixed: ScoreLineItem[];
  /** Components the model must score. */
  open: ScoreComponent[];
  /** Whether this score searches the web. Always true since 2026-09-25. */
  grounded: boolean;
};

const component = (key: ScoreComponentKey): ScoreComponent =>
  SCORE_COMPONENTS.find((c) => c.key === key)!;

function line(key: ScoreComponentKey, awarded: number, reason: string): ScoreLineItem {
  const c = component(key);
  return { pillar: PILLAR_LABELS[c.pillar], component: c.name, awarded, max: c.max, reason };
}

const FETCHED = new Set(CITIES.map((c) => c.id));

/** 3A. Null when the gate did not resolve enough to say. */
function location(f: ScoringFacts): ScoreLineItem | null {
  if (!f.locationRule || f.locationRule === "UNRESOLVED") return null;
  const city = f.preferredCity?.toLowerCase() ?? null;
  if (city && FETCHED.has(city)) {
    return line("location", 30, `${f.preferredCity} is a fetched city.`);
  }
  if (f.country) {
    return line(
      "location",
      18,
      `${f.isRemote ? "Remote in" : "Elsewhere in"} ${f.country}, a target country but not a fetched city.`,
    );
  }
  if (f.isRemote) {
    return line("location", 15, "Remote in the target region with no country named.");
  }
  return null;
}

/** 2b. */
function countryPathway(f: ScoringFacts): ScoreLineItem | null {
  if (!f.country) return null;
  return PATHWAY_COUNTRIES.has(f.country)
    ? line("country_pathway", 10, `${f.country} has a named skilled-worker route.`)
    : line("country_pathway", 0, `The skill names no pathway bonus for ${f.country}.`);
}

/** 2d. Every job arrives from LinkedIn or an upload unless its source says otherwise. */
function portal(f: ScoringFacts): ScoreLineItem {
  return f.source === "visasponsor"
    ? line("portal", 5, "Sourced from visasponsor.jobs, a visa-specific portal.")
    : line("portal", 0, `Sourced from ${f.source ?? "a standard board"}, not a visa-specific portal.`);
}

const SENIOR_TITLE = /\b(director|vp|vice president|head of)\b/i;

/** 2C (years part) and 3C, from the requirement the gate read. */
function experience(f: ScoringFacts): ScoreLineItem[] {
  const e = f.experience;
  if (!e || e.rule === "NOT_STATED" || (e.requiredMin === null && e.requiredMax === null)) {
    return [];
  }
  const min = e.requiredMin;
  const max = e.requiredMax;
  const asked =
    min !== null && max !== null ? `${min}-${max} years` : min !== null ? `${min}+ years` : `up to ${max} years`;

  if (SENIOR_TITLE.test(f.title)) {
    return [
      line("seniority_years", 5, `Director/VP-level title; asks ${asked}.`),
      line("experience_fit", 5, `Director/VP-level title; asks ${asked}.`),
    ];
  }

  const over = max !== null && max <= 5;
  const years =
    min !== null && min >= 12 ? 5 : min !== null && min >= 10 ? 10 : over ? 10 : 15;
  const fit =
    min !== null && min >= 15 ? 5 : min !== null && min >= 10 ? 10 : over ? 10 : 15;

  const why = (points: number) =>
    points === 15
      ? `Asks ${asked}; 9 years is a match.`
      : over
        ? `Asks ${asked}; 9 years reads as overqualified.`
        : `Asks ${asked}; a stretch on 9 years.`;

  return [line("seniority_years", years, why(years)), line("experience_fit", fit, why(fit))];
}

const REACHABILITY_POINTS: Record<string, [number, string]> = {
  referral: [15, "Referral available at the company."],
  recruiter_contact: [10, "Recruiter or hiring manager contactable on LinkedIn."],
  careers_page: [5, "Direct apply on the company careers page."],
  generic_portal: [2, "Generic portal only."],
};

/** 3D. Always settled: the input is either given or it is not. */
function reachability(f: ScoringFacts): ScoreLineItem {
  const hit = f.reachability ? REACHABILITY_POINTS[f.reachability] : undefined;
  if (hit) return line("reachability", hit[0], hit[1]);
  // The value the model chose most often for "not provided" (10 of 14 runs).
  return line("reachability", 5, "Not provided; scored as a direct application.");
}

/** 3E. */
function postingAge(f: ScoringFacts): ScoreLineItem {
  if (!f.postedAt) return line("posting_age", 0, "Posting date unknown; no modifier.");
  const posted = new Date(f.postedAt);
  if (Number.isNaN(posted.getTime())) return line("posting_age", 0, "Posting date unreadable; no modifier.");
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.max(0, Math.round((day(f.today) - day(posted)) / 86_400_000));
  if (days <= 2) return line("posting_age", 5, `Posted ${days} day${days === 1 ? "" : "s"} ago.`);
  if (days <= 7) return line("posting_age", 0, `Posted ${days} days ago.`);
  if (days <= 14) return line("posting_age", -5, `Posted ${days} days ago.`);
  return line(
    "posting_age",
    -10,
    `Posted ${days} days ago. Job posted 15+ days ago; likely already in screening. Apply only if high-priority or with referral.`,
  );
}

/**
 * 2a. Tier A is final anywhere: nothing can score above it. Below that it is
 * settled only in the UK, where the register is local and no search runs.
 */
function evidenceTier(f: ScoringFacts): ScoreLineItem | null {
  const tier = f.watchlistTier ?? 0;
  if (tier >= 4) return line("evidence_tier", 35, `Tier A: on the sponsorship watchlist at tier ${tier}.`);
  if (f.visaReasonCode === "EXPLICIT_SPONSORSHIP_AVAILABLE") {
    return line("evidence_tier", 35, "Tier A: the posting offers sponsorship in committed language.");
  }

  const localRegister = hasLocalSponsorRegister(f.country);
  if (!localRegister || f.sponsorStatus === "unknown" || f.source === "visasponsor") return null;

  if (tier === 3) return line("evidence_tier", 20, "Tier B: on the sponsorship watchlist at tier 3.");
  if (f.sponsorStatus === "confirmed" || f.sponsorStatus === "probable") {
    return line("evidence_tier", 20, "Tier B: licensed on the UK sponsor register, no contrary language.");
  }
  if (f.visaReasonCode === "CONDITIONAL_SPONSORSHIP") {
    return line("evidence_tier", 20, "Tier B: the posting offers sponsorship in hedged language.");
  }
  return line("evidence_tier", 5, "Tier D: no register entry, no watchlist, no sponsorship language.");
}

export function fixedScoring(f: ScoringFacts): FixedScoring {
  const fixed = [
    evidenceTier(f),
    countryPathway(f),
    portal(f),
    ...experience(f),
    location(f),
    reachability(f),
    postingAge(f),
  ].filter((l): l is ScoreLineItem => l !== null);

  const fixedNames = new Set(fixed.map((l) => l.component));
  const open = SCORE_COMPONENTS.filter((c) => !fixedNames.has(c.name));

  // Every score searches, in every country (owner, 2026-09-25). Behavioral
  // Signals exist only in search results, and the skill scores them 0 when no
  // search ran, so any exception silently caps the visa pillar. Two exceptions
  // were tried and both did exactly that: UK jobs (2026-09-19) and watchlist
  // tier 4-5 companies (2026-09-25, reverted the same day).
  const grounded = true;

  return { fixed, open, grounded };
}

/** The prompt section that hands the fixed part over and names the open part. */
export function scoringFixedPromptBlock({ fixed, open }: FixedScoring): string {
  return [
    "### Already scored by the application (fixed — do not re-score or restate)",
    ...fixed.map((l) => `- ${l.pillar} · ${l.component}: ${l.awarded}/${l.max} — ${l.reason}`),
    "",
    "### Score only these components, using these exact names",
    ...open.map((c) => `- ${PILLAR_LABELS[c.pillar]} · ${c.name} (${c.min}-${c.max})`),
  ].join("\n");
}
