/**
 * Human-readable names for each filter's own outcomes (JSV2S1153).
 *
 * The filter panel's categories are the pre-qualification filters, and the
 * values are the outcomes that filter actually produced. So "Experience"
 * offers BELOW_FLOOR and NOT_STATED rather than a bare pass/fail — which is the
 * difference between "why was this rejected" and "was it rejected".
 *
 * Pure: no database, no config import, so the panel can render these on either
 * side of the wire.
 */

export const ROLE_RULE_LABELS: Record<string, string> = {
  TARGET_ROLE: "Target role",
  JUNIOR_ROLE: "Too junior",
  EXCLUDED_ROLE: "Excluded role",
  NO_MATCH: "No role match",
};

export const EXPERIENCE_RULE_LABELS: Record<string, string> = {
  WITHIN_RANGE: "Within range",
  BELOW_FLOOR: "Below the floor",
  ABOVE_CEILING: "Above the ceiling",
  NOT_STATED: "Not stated",
};

export const LOCATION_RULE_LABELS: Record<string, string> = {
  TARGET_COUNTRY: "Target country",
  TARGET_REGION: "Target region",
  REMOTE_TARGET: "Remote, in target",
  NON_TARGET_COUNTRY: "Non-target country",
  UNRESOLVED: "Location unresolved",
};

/**
 * Domain reports no `rule` — it reports which tier carried the score. That is
 * the more useful axis anyway: "payments-adjacent" says why a job scored 0.6
 * where "fail" says only that it did.
 */
export const DOMAIN_TIER_LABELS: Record<string, string> = {
  payments: "Payments (Tier 1)",
  payments_adjacent: "Payments-adjacent (Tier 2)",
  broader_fintech: "Broader fintech (Tier 3)",
  none: "No domain signal",
};

/**
 * Visa language reports its reason code, which is the axis worth filtering on:
 * "explicitly refused" and "only generic boilerplate" are both non-passes and
 * mean entirely different things (JSV2S1156).
 */
export const VISA_REASON_LABELS: Record<string, string> = {
  EXPLICIT_SPONSORSHIP_AVAILABLE: "Sponsorship offered",
  CONDITIONAL_SPONSORSHIP: "Sponsorship conditional",
  EXPLICIT_NO_SPONSORSHIP: "Sponsorship refused",
  ROLE_NOT_SPONSORABLE: "Role not sponsorable",
  EXISTING_AUTHORIZATION_REQUIRED: "Existing authorisation wanted",
  CITIZENSHIP_RESTRICTION: "Citizenship restriction",
  LOCAL_CANDIDATES_ONLY: "Local candidates only",
  CONTRADICTORY: "Contradictory statements",
  GENERIC_RIGHT_TO_WORK: "Generic right-to-work text",
  UNKNOWN: "Nothing said about visas",
};

export const FILTER_VALUE_LABELS: Record<string, Record<string, string>> = {
  role: ROLE_RULE_LABELS,
  domain: DOMAIN_TIER_LABELS,
  experience: EXPERIENCE_RULE_LABELS,
  location: LOCATION_RULE_LABELS,
  visa: VISA_REASON_LABELS,
};

/** Which jsonb key each filter's values are read from. */
export const FILTER_VALUE_KEY: Record<string, "rule" | "primaryDomain" | "reasonCode"> = {
  role: "rule",
  domain: "primaryDomain",
  experience: "rule",
  location: "rule",
  visa: "reasonCode",
};

export function labelFor(filter: string, value: string): string {
  return FILTER_VALUE_LABELS[filter]?.[value] ?? value;
}
