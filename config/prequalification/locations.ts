/**
 * Geography vocabulary (JSV2S1054, JSV2S1138).
 *
 * Two corrections to the source PRD, both of which would have discarded real
 * jobs:
 *
 * 1. **Portugal was missing** from the EU list while Lisboa is a preferred
 *    city — so "Lisbon, Portugal" resolved to an explicit non-target country
 *    and was rejected outright.
 * 2. **The EMI belt was missing.** Estonia, Lithuania, Luxembourg and Malta are
 *    where a large share of European payments licences actually sit — Wise's
 *    own hub is Tallinn, which the Wise score report itself named.
 */

export type RegionId = "UK" | "EU" | "EEA" | "UAE";

/**
 * Region → the country names that resolve into it.
 *
 * `EEA` covers European countries outside the EU that are still realistic
 * relocation targets. Kept separate from `EU` so the label stays honest — the
 * candidate is not applying for an EU passport, he is applying for a job.
 */
export const REGIONS: Record<RegionId, readonly string[]> = {
  UK: [
    "united kingdom",
    "uk",
    "great britain",
    "gb",
    "england",
    "scotland",
    "wales",
    "northern ireland",
  ],
  EU: [
    "germany",
    "netherlands",
    "the netherlands",
    "holland",
    "sweden",
    "france",
    "ireland",
    "republic of ireland",
    "spain",
    "italy",
    "belgium",
    "austria",
    // Added 2026-09-04 — absent from the source PRD.
    "portugal",
    "estonia",
    "lithuania",
    "latvia",
    "luxembourg",
    "malta",
    "poland",
    "denmark",
    "finland",
    "czechia",
    "czech republic",
  ],
  EEA: ["switzerland", "norway", "iceland"],
  UAE: ["united arab emirates", "uae", "u.a.e."],
};

/** Every region is a target today; narrowing is a config edit. */
export const TARGET_REGIONS: readonly RegionId[] = ["UK", "EU", "EEA", "UAE"];

/**
 * Country aliases that are not simply the country name.
 *
 * The non-target entries matter as much as the target ones: resolving "USA"
 * lets the filter return a confident FAIL instead of an unknown, which is the
 * difference between discarding a job and queueing it for manual review.
 */
export const COUNTRY_ALIASES: Record<string, string> = {
  usa: "united states",
  "u.s.": "united states",
  "u.s.a.": "united states",
  us: "united states",
  america: "united states",
  deutschland: "germany",
  nederland: "netherlands",
  españa: "spain",
  espana: "spain",
  éire: "ireland",
  eire: "ireland",
  suomi: "finland",
  sverige: "sweden",
  polska: "poland",
  österreich: "austria",
  osterreich: "austria",
};

/**
 * Countries we recognise in order to reject them confidently.
 *
 * Without these, "Dublin, Ohio, United States" resolves on the city alone and
 * passes as Ireland — every ambiguous city name is a trap of this shape. Naming
 * the common non-target countries turns a wrong PASS into a correct FAIL, and
 * an unrecognised country still falls through to UNKNOWN rather than rejection.
 */
export const NON_TARGET_COUNTRIES: readonly string[] = [
  "united states",
  "canada",
  "mexico",
  "brazil",
  "argentina",
  "australia",
  "new zealand",
  "india",
  "singapore",
  "japan",
  "china",
  "hong kong",
  "south korea",
  "indonesia",
  "philippines",
  "vietnam",
  "malaysia",
  "south africa",
  "nigeria",
  "kenya",
  "egypt",
  "israel",
  "turkey",
  "saudi arabia",
  "qatar",
  "bahrain",
  "kuwait",
  "oman",
];

/**
 * Region-level phrases a posting may give instead of a country.
 *
 * "Remote - Europe" is a stated PRD test case that could not pass, because
 * "Europe" is not a country in any list.
 */
export const REGION_PHRASES: Record<string, RegionId | "EUROPE_ANY"> = {
  europe: "EUROPE_ANY",
  european: "EUROPE_ANY",
  "european union": "EU",
  eu: "EU",
  eea: "EEA",
  emea: "EUROPE_ANY",
  "united kingdom": "UK",
  gcc: "UAE",
  "middle east": "UAE",
};

export type CityEntry = {
  /** Canonical display name. */
  name: string;
  country: string;
  /** Spellings a posting might use, lowercase. */
  aliases?: readonly string[];
  /**
   * True when the same city name exists in a non-target country — Dublin is
   * also in Ohio, Manchester in New Hampshire, Birmingham in Alabama. An
   * ambiguous city never overrides an explicit country in the posting.
   */
  ambiguous?: boolean;
};

/**
 * Cities Bharath actively wants, flagged in the UI wherever a job appears.
 *
 * This list drives the highlight only. A city outside it still passes on its
 * country — being un-preferred is not a rejection.
 */
export const PREFERRED_CITIES: readonly CityEntry[] = [
  { name: "London", country: "united kingdom", ambiguous: true },
  { name: "Manchester", country: "united kingdom", ambiguous: true },
  { name: "Dublin", country: "ireland", ambiguous: true },
  { name: "Berlin", country: "germany" },
  { name: "Amsterdam", country: "netherlands" },
  { name: "Stockholm", country: "sweden" },
  { name: "Lisboa", country: "portugal", aliases: ["lisbon", "lisboa"] },
  { name: "Barcelona", country: "spain" },
  { name: "Paris", country: "france", ambiguous: true },
  { name: "Dubai", country: "united arab emirates" },
  {
    name: "Abu Dhabi",
    country: "united arab emirates",
    aliases: ["abu dhabi", "abudhabi", "abu-dhabi"],
  },
];

/**
 * Other cities worth resolving to a country, so a posting that gives only a
 * city is not thrown away. Not preferred — just recognised.
 */
export const KNOWN_CITIES: readonly CityEntry[] = [
  { name: "Edinburgh", country: "united kingdom" },
  { name: "Glasgow", country: "united kingdom" },
  { name: "Leeds", country: "united kingdom" },
  { name: "Bristol", country: "united kingdom" },
  { name: "Cambridge", country: "united kingdom", ambiguous: true },
  { name: "Belfast", country: "united kingdom" },
  { name: "Munich", country: "germany", aliases: ["münchen", "munchen"] },
  { name: "Frankfurt", country: "germany" },
  { name: "Hamburg", country: "germany" },
  { name: "Cologne", country: "germany", aliases: ["köln", "koln"] },
  { name: "Rotterdam", country: "netherlands" },
  { name: "Utrecht", country: "netherlands" },
  { name: "Eindhoven", country: "netherlands" },
  { name: "Madrid", country: "spain" },
  { name: "Valencia", country: "spain" },
  { name: "Milan", country: "italy", aliases: ["milano"] },
  { name: "Rome", country: "italy", aliases: ["roma"] },
  { name: "Vienna", country: "austria", aliases: ["wien"] },
  { name: "Brussels", country: "belgium", aliases: ["bruxelles", "brussel"] },
  { name: "Copenhagen", country: "denmark", aliases: ["københavn", "kobenhavn"] },
  { name: "Helsinki", country: "finland" },
  { name: "Oslo", country: "norway" },
  { name: "Zurich", country: "switzerland", aliases: ["zürich"] },
  { name: "Geneva", country: "switzerland", aliases: ["genève", "geneve"] },
  { name: "Warsaw", country: "poland", aliases: ["warszawa"] },
  { name: "Krakow", country: "poland", aliases: ["kraków", "krakow"] },
  { name: "Prague", country: "czechia", aliases: ["praha"] },
  { name: "Tallinn", country: "estonia" },
  { name: "Vilnius", country: "lithuania" },
  { name: "Riga", country: "latvia" },
  { name: "Luxembourg City", country: "luxembourg" },
  { name: "Valletta", country: "malta" },
  { name: "Porto", country: "portugal" },
  { name: "Sharjah", country: "united arab emirates" },
];

/** Work-arrangement markers. Hybrid is treated as on-site for geography. */
export const REMOTE_MARKERS: readonly string[] = [
  "remote",
  "fully remote",
  "work from home",
  "wfh",
  "distributed",
  "anywhere",
];

export const HYBRID_MARKERS: readonly string[] = ["hybrid", "flexible working"];
