import { FETCH_LOCATIONS } from "@/config/pipeline";
import generated from "./images.generated.json";

/**
 * The cities the workspace is organised around (JSV2S1172).
 *
 * DERIVED FROM `FETCH_LOCATIONS`, not written out again. The first design draft
 * hardcoded eight cities including Singapore — which sits in
 * `NON_TARGET_COUNTRIES`, so the gate rejects it outright and its card could
 * never have shown a single job. A list that cannot disagree with the fetcher
 * cannot make that mistake: add a location to the nightly plan and its card
 * appears, remove it and the card goes.
 *
 * Photographs here, paintings on the detail screen. The two are doing different
 * jobs — a photograph says *where*, at a glance, across eight cards; the
 * painting says *this particular job* once you are inside it.
 */

export type City = {
  /** Lower-case key, matching the city resolved by the location filter. */
  id: string;
  name: string;
  country: string;
  /** The location string sent to the actor, for tracing a card to its fetch. */
  fetchLocation: string;
  /** 1200x800. */
  card: string;
  /** 2.4:1, up to 2400 wide — see scripts/build-city-images.mts. */
  hero: string;
  /** 20px WebP, inlined so eight cards do not pop in one at a time. */
  blur: string;
};

type Images = Record<string, { card: string; hero: string; blur: string }>;
const images = generated as Images;

/** "Lisboa, Portugal" → { id: "lisboa", name: "Lisboa", country: "Portugal" }. */
function parse(location: string): { id: string; name: string; country: string } {
  const [rawCity, rawCountry] = location.split(",").map((p) => p.trim());
  // "Luxembourg" is both the city and the country, and the actor is given one
  // word. Splitting on a comma that is not there would leave the country empty.
  const country = rawCountry ?? rawCity;
  return { id: rawCity.toLowerCase(), name: rawCity, country };
}

export const CITIES: readonly City[] = FETCH_LOCATIONS.map((location) => {
  const { id, name, country } = parse(location);
  const img = images[id];
  return {
    id,
    name,
    country,
    fetchLocation: location,
    // An absent photograph is a missing file, not a crash: the card falls back
    // to its blur or to a flat tone, and `npm run cities:build` reports it.
    card: img?.card ?? "",
    hero: img?.hero ?? "",
    blur: img?.blur ?? "",
  };
});

const byId = new Map(CITIES.map((c) => [c.id, c]));

export function cityById(id: string | null | undefined): City | null {
  if (!id) return null;
  return byId.get(id.trim().toLowerCase()) ?? null;
}

/**
 * Which city a job belongs to.
 *
 * Matched on the city the gate already resolved, so the grouping here and the
 * verdict on the detail screen can never disagree about where a job is.
 */
export function cityForJob(
  preferredCity: string | null | undefined,
  location: string | null | undefined,
): City | null {
  const direct = cityById(preferredCity);
  if (direct) return direct;
  if (!location) return null;
  const haystack = location.toLowerCase();
  return CITIES.find((c) => haystack.includes(c.id)) ?? null;
}
