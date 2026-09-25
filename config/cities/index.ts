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
  /**
   * `city` is a fetch location. `remote` and `other` are cards with no fetch
   * behind them (2026-09-24): without them a job that names no target city had
   * nowhere to be listed, and 34 of 160 applications were unreachable.
   */
  kind: "city" | "remote" | "other";
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
    kind: "city" as const,
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

/**
 * The two cards that are not places (2026-09-24). Kept out of `CITIES`, which
 * stays the fetch plan, and after them in `CARDS`, so they sort last on the
 * grid. Their photographs go through `npm run cities:build` like a city's
 * (2026-09-24), from `assets/city-source/{remote,other}-card.jpg`:
 *   remote: "Laptop on a neat desk (Unsplash)", CC0, Wikimedia Commons
 *   other:  "Northwestern Europe at Night", ISS photograph, NASA, public domain
 * Their ids must never collide with a city's: `remote` and `other` are not
 * places anyone fetches.
 */
export const REMOTE_CARD: City = {
  id: "remote",
  kind: "remote",
  name: "Remote",
  country: "Anywhere",
  fetchLocation: "",
  card: images.remote?.card ?? "",
  hero: images.remote?.hero ?? "",
  blur: images.remote?.blur ?? "",
};

export const OTHER_CARD: City = {
  id: "other",
  kind: "other",
  name: "Other locations",
  country: "No target city named",
  fetchLocation: "",
  card: images.other?.card ?? "",
  hero: images.other?.hero ?? "",
  blur: images.other?.blur ?? "",
};

export const CARDS: readonly City[] = [...CITIES, REMOTE_CARD, OTHER_CARD];

const byId = new Map(CARDS.map((c) => [c.id, c]));

export function cityById(id: string | null | undefined): City | null {
  if (!id) return null;
  return byId.get(id.trim().toLowerCase()) ?? null;
}
