import { PREQUAL_CONFIG } from "@/config/prequalification";
import type { CityEntry, RegionId } from "@/config/prequalification/locations";
import { containsPhrase, normalizeText } from "./normalize";
import type { LocationResult } from "./types";

/**
 * Location filter (PRD §10, JSV2S1138).
 *
 * Resolution order is city → country → region phrase, and the rule that keeps
 * it honest is that **an explicit country always outranks a bare city name**.
 * Dublin is also in Ohio, Manchester in New Hampshire, Birmingham in Alabama;
 * "Dublin, CA, United States" must reject, not pass on the city.
 */

type Resolved = {
  city: string | null;
  country: string | null;
  region: RegionId | null;
  preferredCity: string | null;
};

function regionForCountry(country: string): RegionId | null {
  for (const [region, countries] of Object.entries(PREQUAL_CONFIG.locations.regions)) {
    if (countries.includes(country)) return region as RegionId;
  }
  return null;
}

function canonicalCountry(text: string): string | null {
  const { regions, countryAliases, nonTargetCountries } = PREQUAL_CONFIG.locations;

  for (const [alias, canonical] of Object.entries(countryAliases)) {
    if (containsPhrase(text, alias)) return canonical;
  }

  // Target countries win over non-target ones, so a posting listing several
  // locations ("London, Berlin or New York") passes on the one that qualifies.
  // Longest first, so "united kingdom" is not shadowed by a shorter entry.
  const targets = Object.values(regions).flat().sort((a, b) => b.length - a.length);
  for (const country of targets) {
    if (containsPhrase(text, country)) return country;
  }

  for (const country of [...nonTargetCountries].sort((a, b) => b.length - a.length)) {
    if (containsPhrase(text, country)) return country;
  }

  return null;
}

function findCity(text: string): { entry: CityEntry; preferred: boolean } | null {
  const { preferredCities, knownCities } = PREQUAL_CONFIG.locations;

  for (const entry of preferredCities) {
    const names = [entry.name.toLowerCase(), ...(entry.aliases ?? [])];
    if (names.some((n) => containsPhrase(text, n))) return { entry, preferred: true };
  }
  for (const entry of knownCities) {
    const names = [entry.name.toLowerCase(), ...(entry.aliases ?? [])];
    if (names.some((n) => containsPhrase(text, n))) return { entry, preferred: false };
  }
  return null;
}

function resolve(text: string): Resolved {
  const explicitCountry = canonicalCountry(text);
  const city = findCity(text);

  // An explicit country wins. An ambiguous city name paired with a country
  // that is not its own is a different city of the same name.
  if (explicitCountry) {
    const cityAgrees = city ? city.entry.country === explicitCountry : false;
    return {
      city: cityAgrees ? city!.entry.name : null,
      country: explicitCountry,
      region: regionForCountry(explicitCountry),
      preferredCity: cityAgrees && city!.preferred ? city!.entry.name : null,
    };
  }

  if (city) {
    // A bare ambiguous city resolves optimistically but is still reported, so
    // the review queue can show why.
    return {
      city: city.entry.name,
      country: city.entry.country,
      region: regionForCountry(city.entry.country),
      preferredCity: city.preferred ? city.entry.name : null,
    };
  }

  return { city: null, country: null, region: null, preferredCity: null };
}

export function evaluateLocation(
  location: string | null | undefined,
  country: string | null | undefined,
  description?: string | null,
): LocationResult {
  const { remoteMarkers, hybridMarkers, regionPhrases, targetRegions } =
    PREQUAL_CONFIG.locations;

  // Only the location fields are trusted for geography. A JD body mentioning
  // "our New York office" must not relocate a London job.
  const text = normalizeText([location, country].filter(Boolean).join(", "));
  const remoteText = normalizeText(
    [location, country, description?.slice(0, 400)].filter(Boolean).join(" "),
  );

  const isRemote = remoteMarkers.some((m) => containsPhrase(remoteText, m));
  const isHybrid = hybridMarkers.some((m) => containsPhrase(remoteText, m));

  const base = { isRemote, isHybrid };

  if (!text) {
    return {
      ...base,
      status: "unknown",
      rule: "UNRESOLVED",
      city: null,
      country: null,
      region: null,
      preferredCity: null,
      reason: "No location was given.",
    };
  }

  const resolved = resolve(text);

  if (resolved.region) {
    const onTarget = targetRegions.includes(resolved.region);
    const where = resolved.city ? `${resolved.city}, ${resolved.country}` : resolved.country;
    return {
      ...base,
      status: onTarget ? "pass" : "fail",
      rule: onTarget
        ? isRemote
          ? "REMOTE_TARGET"
          : "TARGET_COUNTRY"
        : "NON_TARGET_COUNTRY",
      city: resolved.city,
      country: resolved.country,
      region: resolved.region,
      preferredCity: resolved.preferredCity,
      reason: onTarget
        ? `${where} is in ${resolved.region}, a target region.`
        : `${where} is outside the target regions.`,
    };
  }

  // A country we resolved but that belongs to no configured region is an
  // explicit non-target — that is what makes "New York, USA" a confident FAIL
  // rather than an unknown.
  if (resolved.country) {
    return {
      ...base,
      status: "fail",
      rule: "NON_TARGET_COUNTRY",
      city: resolved.city,
      country: resolved.country,
      region: null,
      preferredCity: null,
      reason: `${resolved.country} is not a target country.`,
    };
  }

  // "Remote - Europe" and "EMEA": no country, but a region phrase. A stated
  // PRD test case that could not pass, because Europe is not a country.
  for (const [phrase, region] of Object.entries(regionPhrases)) {
    if (!containsPhrase(text, phrase)) continue;
    const onTarget = region === "EUROPE_ANY" || targetRegions.includes(region);
    return {
      ...base,
      status: onTarget ? "pass" : "unknown",
      rule: isRemote ? "REMOTE_TARGET" : "TARGET_REGION",
      city: null,
      country: null,
      region: region === "EUROPE_ANY" ? "Europe" : region,
      preferredCity: null,
      reason: `Posting names ${phrase}, within the target geography.`,
    };
  }

  return {
    ...base,
    status: "unknown",
    rule: "UNRESOLVED",
    city: null,
    country: null,
    region: null,
    preferredCity: null,
    // PRD §10: an unknown location is never a rejection.
    reason: isRemote
      ? `Remote, but "${location}" names no identifiable geography.`
      : `Could not resolve "${location}" to a country.`,
  };
}
