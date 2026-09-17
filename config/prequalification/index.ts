import { createHash } from "node:crypto";

import {
  DOMAIN_TIERS,
  NEGATIVE_DOMAIN_TERMS,
  RESTRICTED_TERMS,
} from "./domains";
import {
  COUNTRY_ALIASES,
  HYBRID_MARKERS,
  KNOWN_CITIES,
  NON_TARGET_COUNTRIES,
  PREFERRED_CITIES,
  REGION_PHRASES,
  REGIONS,
  REMOTE_MARKERS,
  TARGET_REGIONS,
} from "./locations";
import {
  EXCLUDED_ROLES,
  JUNIOR_MARKERS,
  LEVEL_SUFFIX,
  TARGET_ROLES,
  TITLE_ALIASES,
} from "./roles";
import { DOMAIN_GATE, EXPERIENCE, GATING_TRIGGERS, SECTION_WEIGHTS } from "./thresholds";

/**
 * The assembled pre-qualification configuration (JSV2S1056).
 *
 * TS-as-data rather than the YAML the source PRD suggested. The requirement was
 * that changing "Principal Product Manager", "Netherlands" or a threshold must
 * not touch application logic — which this satisfies — and TS additionally buys
 * comments explaining *why* a term is restricted, compile-time typo detection,
 * and no new dependency. `features/ingestion/sources/types.ts` already records
 * the same decision against YAML for source configuration.
 */
export const PREQUAL_CONFIG = {
  roles: {
    target: TARGET_ROLES,
    excluded: EXCLUDED_ROLES,
    juniorMarkers: JUNIOR_MARKERS,
    aliases: TITLE_ALIASES,
    levelSuffix: LEVEL_SUFFIX,
  },
  domains: {
    tiers: DOMAIN_TIERS,
    restricted: RESTRICTED_TERMS,
    negative: NEGATIVE_DOMAIN_TERMS,
    gate: DOMAIN_GATE,
  },
  locations: {
    regions: REGIONS,
    targetRegions: TARGET_REGIONS,
    countryAliases: COUNTRY_ALIASES,
    nonTargetCountries: NON_TARGET_COUNTRIES,
    regionPhrases: REGION_PHRASES,
    preferredCities: PREFERRED_CITIES,
    knownCities: KNOWN_CITIES,
    remoteMarkers: REMOTE_MARKERS,
    hybridMarkers: HYBRID_MARKERS,
  },
  experience: EXPERIENCE,
  sectionWeights: SECTION_WEIGHTS,
  gatingTriggers: GATING_TRIGGERS,
} as const;

export type PrequalConfig = typeof PREQUAL_CONFIG;

/**
 * A stable fingerprint of the configuration, stored with every verdict.
 *
 * Without it, adding a role or a country leaves you unable to tell which
 * previously-rejected jobs deserve another look. With it, finding them is
 * `where prequalification_version <> $current`.
 *
 * `RegExp` and `undefined` do not survive `JSON.stringify`, so they are
 * serialised explicitly — otherwise an alias change would not move the hash.
 */
function stableStringify(value: unknown): string {
  if (value instanceof RegExp) return `re:${value.source}:${value.flags}`;
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${stableStringify(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Revision of the RULES ENGINE, as distinct from the config it reads.
 *
 * `CONFIG_VERSION` hashes `PREQUAL_CONFIG`, which meant a change to the engine
 * itself was invisible to it: on 2026-09-17 the experience guard was corrected
 * to stop treating an open-ended "4+ years" as a ceiling, four jobs should have
 * been re-judged, and every stored verdict still looked current because no
 * config VALUE had moved. A logic fix that nothing re-runs is a fix that never
 * reaches the data.
 *
 * Bump this whenever the behaviour of features/prequalification/ changes in a
 * way that could alter a verdict. It costs one re-run and nothing else.
 */
export const ENGINE_REVISION = 2;

export const CONFIG_VERSION = createHash("sha256")
  .update(`engine:${ENGINE_REVISION}|${stableStringify(PREQUAL_CONFIG)}`)
  .digest("hex")
  .slice(0, 12);

export * from "./domains";
export * from "./locations";
export * from "./roles";
export * from "./thresholds";
