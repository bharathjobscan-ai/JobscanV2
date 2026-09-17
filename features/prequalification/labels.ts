/**
 * Human-readable names for each filter's own outcomes (JSV2S1153).
 *
 * The filter panel's categories are the four pre-qualification filters, and the
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

export const FILTER_VALUE_LABELS: Record<string, Record<string, string>> = {
  role: ROLE_RULE_LABELS,
  domain: DOMAIN_TIER_LABELS,
  experience: EXPERIENCE_RULE_LABELS,
  location: LOCATION_RULE_LABELS,
};

/** Which jsonb key each filter's values are read from. */
export const FILTER_VALUE_KEY: Record<string, "rule" | "primaryDomain"> = {
  role: "rule",
  domain: "primaryDomain",
  experience: "rule",
  location: "rule",
};

export function labelFor(filter: string, value: string): string {
  return FILTER_VALUE_LABELS[filter]?.[value] ?? value;
}
