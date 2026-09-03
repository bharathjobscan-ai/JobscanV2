/**
 * Role vocabulary (JSV2S1054).
 *
 * This list is Bharath's, verbatim, and deliberately short. Widening it is a
 * one-line edit here; nothing in `features/prequalification/` needs touching.
 *
 * Order of evaluation in `role.ts` is: excluded → junior → primary →
 * acceptable → adjacent. Excluded is checked first because most exclusions are
 * substring traps: "Technical Program Manager" and "Product Marketing Manager"
 * both look like near-misses for a target title.
 */

export type RoleTier = "primary" | "acceptable" | "adjacent";

export const TARGET_ROLES: Record<RoleTier, readonly string[]> = {
  primary: [
    "product manager",
    "senior product manager",
    "lead product manager",
    "principal product manager",
  ],
  acceptable: ["product owner", "senior product owner"],
  adjacent: ["technical product manager", "product strategy"],
};

/**
 * Titles that are near-misses, not matches.
 *
 * "Sales" is a bare word rather than a title because postings vary endlessly
 * ("Sales Lead", "Head of Sales", "Sales Engineer") and none of them are this
 * job. It is matched on word boundaries, so "Sales Operations" is caught while
 * a payments JD mentioning "sales tax" in the body is not — the role filter
 * only ever reads the title.
 */
export const EXCLUDED_ROLES: readonly string[] = [
  "project manager",
  "program manager",
  "programme manager",
  "technical program manager",
  "technical programme manager",
  "product marketing manager",
  "product designer",
  "business analyst",
  "scrum master",
  "engineering manager",
  "sales",
  "marketing manager",
  "customer success manager",
  "operations manager",
];

/**
 * Seniority floor (decided 2026-09-04).
 *
 * Without this, "Associate Product Manager" contains "product manager" and
 * passes the role filter, then passes the experience filter too because a JD
 * asking "2+ years" sets a minimum a 9-year candidate clears. The job would be
 * scored and tailored at full cost. These markers FAIL rather than returning
 * unknown — a junior title is a contradicting signal, not a missing one.
 */
export const JUNIOR_MARKERS: readonly string[] = [
  "associate",
  "assoc",
  "apm",
  "junior",
  "jr",
  "graduate",
  "grad",
  "trainee",
  "intern",
  "internship",
  "entry level",
  "early career",
  "working student",
];

/**
 * Title rewrites applied before matching.
 *
 * `Product Lead` is here rather than in TARGET_ROLES on purpose: it is the same
 * rung as Lead Product Manager, and resolving it as an alias keeps the target
 * list exactly as written. It is also the title of the Wise role that started
 * this work, and Bharath's own line at Juspay.
 *
 * Order matters — these run in sequence, so longer phrases come first.
 */
export const TITLE_ALIASES: readonly (readonly [RegExp, string])[] = [
  // Seniority words, normalised before the noun phrase is read.
  //
  // The lookahead rather than a trailing `\b` is deliberate: "sr." ends on a
  // period, and `\b` after an optional period never matches because full stop
  // to space is non-word to non-word.
  [/\bsr\.?(?=\s|$)/g, "senior"],
  [/\bsnr\.?(?=\s|$)/g, "senior"],
  [/\bjr\.?(?=\s|$)/g, "junior"],

  // "PM" only expands next to a seniority or product word. On its own it is
  // ambiguous enough (project/program/product) to be worth leaving alone.
  [/\bgroup pm\b/g, "group product manager"],
  [/\bsenior pm\b/g, "senior product manager"],
  [/\blead pm\b/g, "lead product manager"],
  [/\bprincipal pm\b/g, "principal product manager"],
  [/\bstaff pm\b/g, "staff product manager"],
  [/\btechnical pm\b/g, "technical product manager"],
  [/\bassociate pm\b/g, "associate product manager"],

  // The Product Lead family collapses onto Lead Product Manager.
  [/\bproduct lead\b/g, "lead product manager"],
  [/\bproduct line lead\b/g, "lead product manager"],

  [/\bproduct owner\b/g, "product owner"],
  [/\bpo\b/g, "product owner"],
];

/**
 * Level suffixes stripped before matching: "Senior Product Manager II",
 * "Product Manager (P4)", "PM L5". They carry no signal this filter uses.
 */
export const LEVEL_SUFFIX = /\s*[\(\[]?\b(?:[ivx]{1,4}|l\d{1,2}|p\d{1,2}|t\d{1,2}|\d)\b[\)\]]?\s*$/;
