import {
  CITY_ARTWORK,
  COUNTRY_ARTWORK,
  DEFAULT_ARTWORK_KEY,
  type Artwork,
} from "@/config/artwork";
import {
  COUNTRY_ALIASES,
  KNOWN_CITIES,
  PREFERRED_CITIES,
} from "@/config/prequalification/locations";

/**
 * Which painting belongs to a job (JSV2S1143).
 *
 * Deterministic and offline: city, then country, then the default. No AI, no
 * network, no per-render work beyond a couple of map lookups — the backdrop is
 * decoration, and decoration must never be able to slow down or break the page.
 *
 * City aliases come from `config/prequalification/locations.ts` rather than
 * being re-listed here, so "Lisboa" and "München" resolve the same way for
 * artwork as they do for pre-qualification. Two lists would drift.
 */

export type ResolvedArtwork = Artwork & {
  /** How it was chosen, so the credit can be honest about a fallback. */
  via: "city" | "country" | "default";
  /** Path under /public, written by scripts/fetch-artwork.mts. */
  src: string;
};

function normalise(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical city key for a free-text location, using the shared alias lists. */
function cityKeyFor(location: string): string | null {
  const text = normalise(location);

  for (const entry of [...PREFERRED_CITIES, ...KNOWN_CITIES]) {
    const names = [entry.name, ...(entry.aliases ?? [])].map(normalise);
    // Word-boundary match: "Cambridge" must not fire inside "Cambridgeshire",
    // and a plain substring test on short names matches far too much.
    if (names.some((n) => n && new RegExp(`\\b${n}\\b`).test(text))) {
      return normalise(entry.name);
    }
  }

  // A city we hold art for that the location config does not list.
  for (const key of Object.keys(CITY_ARTWORK)) {
    if (new RegExp(`\\b${key}\\b`).test(text)) return key;
  }

  return null;
}

export function resolveArtwork(input: {
  location?: string | null;
  country?: string | null;
}): ResolvedArtwork {
  const withSrc = (art: Artwork, via: ResolvedArtwork["via"]): ResolvedArtwork => ({
    ...art,
    via,
    src: `/artwork/${art.id}.jpg`,
  });

  if (input.location) {
    const key = cityKeyFor(input.location);
    if (key && CITY_ARTWORK[key]) return withSrc(CITY_ARTWORK[key], "city");
  }

  // The country may be stated, or may only appear at the tail of the location.
  const countryText = normalise(input.country ?? input.location ?? "");
  if (countryText) {
    for (const [country, cityKey] of Object.entries(COUNTRY_ARTWORK)) {
      const canonical = normalise(COUNTRY_ALIASES[country] ?? country);
      if (
        new RegExp(`\\b${canonical}\\b`).test(countryText) ||
        new RegExp(`\\b${normalise(country)}\\b`).test(countryText)
      ) {
        const art = CITY_ARTWORK[cityKey];
        if (art) return withSrc(art, "country");
      }
    }
  }

  return withSrc(CITY_ARTWORK[DEFAULT_ARTWORK_KEY], "default");
}
