import { PREQUAL_CONFIG } from "@/config/prequalification";
import type { RoleTier } from "@/config/prequalification/roles";
import { containsPhrase, normalizeTitle, titleHead } from "./normalize";
import type { RoleResult } from "./types";

/**
 * Role filter (PRD §5).
 *
 * Reads the **title only**. A payments JD that mentions "we work closely with
 * programme managers" must not be rejected for it, and a programme-management
 * JD that mentions "product" must not be accepted for it.
 *
 * Evaluation order is deliberate and must not be rearranged:
 *
 *   excluded → junior → primary → acceptable → adjacent
 *
 * Excluded runs first because most exclusions are substring traps —
 * "Technical Program Manager" sits one letter from "Technical Product
 * Manager". Junior runs second because "Associate Product Manager" *contains*
 * a target role and would otherwise pass; that hole is the reason the seniority
 * floor exists at all.
 */
export function evaluateRole(title: string): RoleResult {
  const normalized = normalizeTitle(title);
  const head = titleHead(normalized);

  if (!normalized) {
    return {
      status: "unknown",
      rule: "NO_MATCH",
      matchedRole: null,
      tier: null,
      normalizedTitle: normalized,
      reason: "No job title was provided.",
    };
  }

  for (const excluded of PREQUAL_CONFIG.roles.excluded) {
    if (containsPhrase(head, excluded)) {
      return {
        status: "fail",
        rule: "EXCLUDED_ROLE",
        matchedRole: excluded,
        tier: null,
        normalizedTitle: normalized,
        reason: `Title is "${excluded}", which is on the excluded list.`,
      };
    }
  }

  for (const marker of PREQUAL_CONFIG.roles.juniorMarkers) {
    if (containsPhrase(head, marker)) {
      return {
        status: "fail",
        rule: "JUNIOR_ROLE",
        matchedRole: marker,
        tier: null,
        normalizedTitle: normalized,
        reason: `Title carries the junior marker "${marker}", below the target seniority.`,
      };
    }
  }

  // The most specific match wins **across all tiers**, not the first tier with
  // any match. Tier order alone would report "Technical Product Manager" as
  // primary, because "product manager" is a substring of it and primary is
  // checked first. Longest phrase, then tier order to break a tie.
  const tiers: readonly RoleTier[] = ["primary", "acceptable", "adjacent"];
  const matches = tiers.flatMap((tier, rank) =>
    PREQUAL_CONFIG.roles.target[tier]
      .filter((role) => containsPhrase(head, role))
      .map((role) => ({ role, tier, rank })),
  );

  if (matches.length > 0) {
    const best = matches.sort(
      (a, b) => b.role.length - a.role.length || a.rank - b.rank,
    )[0];
    return {
      status: "pass",
      rule: "TARGET_ROLE",
      matchedRole: best.role,
      tier: best.tier,
      normalizedTitle: normalized,
      reason: `Title matches "${best.role}" (${best.tier}).`,
    };
  }

  return {
    status: "unknown",
    rule: "NO_MATCH",
    matchedRole: null,
    tier: null,
    normalizedTitle: normalized,
    // Not a rejection: non-English postings from Berlin, Paris and Lisboa land
    // here, as do genuinely novel titles. A human decides.
    reason: "Title does not match a target or excluded role.",
  };
}
