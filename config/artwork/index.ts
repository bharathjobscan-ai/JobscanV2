/**
 * A famous painting for each job location (JSV2S1143).
 *
 * The application detail screen carries the artwork of the city the job is in,
 * so an application is recognisable at a glance before a single word is read.
 *
 * Three rules, and they are all about not being clever:
 *
 * 1. **Public domain only.** Every work here is by an artist dead more than 70
 *    years, or published before 1900. This is a personal tool, but a painting
 *    still in copyright is still in copyright.
 * 2. **Deterministic resolution.** City, then country, then the default. No AI,
 *    no similarity search — the same job shows the same painting forever.
 * 3. **Fetched once into `/public`, never hotlinked.** `scripts/fetch-artwork.mts`
 *    downloads these; the page has no third-party runtime dependency and no
 *    per-render network call. A Wikimedia outage cannot blank the UI.
 */

export type Artwork = {
  /** Stable key, used as the local filename. */
  id: string;
  title: string;
  artist: string;
  year: string;
  /** Exact file name on Wikimedia Commons, resolved via Special:FilePath. */
  commonsFile: string;
  /** Why this painting for this place — shown as the image credit. */
  note: string;
};

/**
 * Keyed by lower-case city name, matching `PREFERRED_CITIES` and
 * `KNOWN_CITIES` in `config/prequalification/locations.ts`, plus the global
 * hubs a job might reasonably appear in.
 */
export const CITY_ARTWORK: Record<string, Artwork> = {
  london: {
    id: "london-temeraire",
    title: "The Fighting Temeraire",
    artist: "J. M. W. Turner",
    year: "1839",
    commonsFile: "The Fighting Temeraire, JMW Turner, National Gallery.jpg",
    note: "A warship towed to the breaker's yard on the Thames.",
  },
  manchester: {
    id: "manchester-work",
    title: "Work",
    artist: "Ford Madox Brown",
    year: "1863",
    commonsFile: "Ford Madox Brown - Work - Google Art Project.jpg",
    note: "Commissioned for Manchester; labour as the subject of a history painting.",
  },
  dublin: {
    id: "dublin-strongbow",
    title: "The Marriage of Strongbow and Aoife",
    artist: "Daniel Maclise",
    year: "1854",
    commonsFile:
      "Marriage of strongbow and aoife.jpg",
    note: "In the National Gallery of Ireland.",
  },
  berlin: {
    id: "berlin-wanderer",
    title: "Wanderer above the Sea of Fog",
    artist: "Caspar David Friedrich",
    year: "1818",
    commonsFile: "Caspar David Friedrich - Wanderer above the sea of fog.jpg",
    note: "German Romanticism's defining image.",
  },
  amsterdam: {
    id: "amsterdam-nightwatch",
    title: "The Night Watch",
    artist: "Rembrandt van Rijn",
    year: "1642",
    commonsFile: "The Night Watch - HD.jpg",
    note: "The Rijksmuseum's centrepiece.",
  },
  stockholm: {
    id: "stockholm-midsummer",
    title: "Midsummer Dance",
    artist: "Anders Zorn",
    year: "1897",
    commonsFile: "Anders Zorn - Midsummer Dance - Google Art Project.jpg",
    note: "Dancing through a Swedish midsummer night.",
  },
  lisboa: {
    id: "lisbon-saint-vincent",
    title: "Saint Vincent Panels",
    artist: "Nuno Gonçalves",
    year: "c. 1470",
    commonsFile: "Nuno Gonçalves-Saint Vincent Panels.JPG",
    note: "Portugal's most celebrated fifteenth-century painting.",
  },
  barcelona: {
    id: "barcelona-sorolla",
    title: "Walk on the Beach",
    artist: "Joaquín Sorolla",
    year: "1909",
    commonsFile: "Joaquín Sorolla y Bastida - Strolling along the Seashore - Google Art Project.jpg",
    note: "Mediterranean light, which was Sorolla's whole subject.",
  },
  paris: {
    id: "paris-coronation",
    title: "The Coronation of Napoleon",
    artist: "Jacques-Louis David",
    year: "1807",
    commonsFile: "Jacques-Louis David, The Coronation of Napoleon edit.jpg",
    note: "Six metres by ten, in the Louvre.",
  },
  dubai: {
    id: "dubai-tortoise",
    title: "The Tortoise Trainer",
    artist: "Osman Hamdi Bey",
    year: "1906",
    commonsFile: "Osman Hamdi Bey - The Tortoise Trainer - Google Art Project.jpg",
    note: "A painter answering Orientalism from the inside.",
  },
  "abu dhabi": {
    id: "abudhabi-carpet",
    title: "The Carpet Merchant",
    artist: "Jean-Léon Gérôme",
    year: "1887",
    commonsFile: "Jean-Léon Gérôme - The Carpet Merchant - Google Art Project.jpg",
    note: "A carpet bazaar in Cairo.",
  },

  // --- Other European cities in the location config -----------------------
  edinburgh: {
    id: "edinburgh-skating",
    title: "The Skating Minister",
    artist: "Henry Raeburn",
    year: "c. 1795",
    commonsFile: "Reverend Robert Walker (1755 - 1808) Skating on Duddingston Loch.jpg",
    note: "Scotland's best-loved painting.",
  },
  munich: {
    id: "munich-blue-horse",
    title: "Blue Horse I",
    artist: "Franz Marc",
    year: "1911",
    commonsFile: "Marc, Franz - Blue Horse I - Google Art Project.jpg",
    note: "Der Blaue Reiter, founded in Munich.",
  },
  madrid: {
    id: "madrid-meninas",
    title: "Las Meninas",
    artist: "Diego Velázquez",
    year: "1656",
    commonsFile: "Las Meninas, by Diego Velázquez, from Prado in Google Earth.jpg",
    note: "The Prado's great puzzle picture.",
  },
  milan: {
    id: "milan-last-supper",
    title: "The Last Supper",
    artist: "Leonardo da Vinci",
    year: "1498",
    commonsFile: "Leonardo da Vinci (1452-1519) - The Last Supper (1495-1498).jpg",
    note: "On a refectory wall in Santa Maria delle Grazie.",
  },
  rome: {
    id: "rome-athens",
    title: "The School of Athens",
    artist: "Raphael",
    year: "1511",
    commonsFile: "\"The School of Athens\" by Raffaello Sanzio da Urbino.jpg",
    note: "In the Vatican's Stanza della Segnatura.",
  },
  vienna: {
    id: "vienna-kiss",
    title: "The Kiss",
    artist: "Gustav Klimt",
    year: "1908",
    commonsFile: "The Kiss - Gustav Klimt - Google Cultural Institute.jpg",
    note: "The Belvedere's gold-leaf centrepiece.",
  },
  brussels: {
    id: "brussels-hunters",
    title: "The Hunters in the Snow",
    artist: "Pieter Bruegel the Elder",
    year: "1565",
    commonsFile: "Pieter Bruegel the Elder - Hunters in the Snow (Winter) - Google Art Project.jpg",
    note: "Flemish winter, painted in Brussels.",
  },
  copenhagen: {
    id: "copenhagen-interior",
    title: "Interior with Young Woman from Behind",
    artist: "Vilhelm Hammershøi",
    year: "1904",
    commonsFile: "Vilhelm Hammershoi - Interieur mit Rueckenansicht einer Frau - 1903-1904 - Randers Kunstmuseum.jpg",
    note: "Danish quiet, in grey and white.",
  },
  helsinki: {
    id: "helsinki-keitele",
    title: "Lake Keitele",
    artist: "Akseli Gallen-Kallela",
    year: "1905",
    commonsFile: "Akseli Gallen-Kallela - Lake Keitele, 1905.JPG",
    note: "The wake across the water is from Finnish myth.",
  },
  oslo: {
    id: "oslo-scream",
    title: "The Scream",
    artist: "Edvard Munch",
    year: "1893",
    commonsFile: "Edvard Munch, 1893, The Scream, oil, tempera and pastel on cardboard, 91 x 73 cm, National Gallery of Norway.jpg",
    note: "Painted on a road above Oslo.",
  },
  zurich: {
    id: "zurich-thun",
    title: "Lake Thun with Symmetric Reflection",
    artist: "Ferdinand Hodler",
    year: "1905",
    commonsFile: "Hodler - Thunersee mit symmetrischer Spiegelung - 1905.jpg",
    note: "Swiss landscape reduced to symmetry.",
  },
  warsaw: {
    id: "warsaw-grunwald",
    title: "The Battle of Grunwald",
    artist: "Jan Matejko",
    year: "1878",
    commonsFile: "Jan Matejko, Bitwa pod Grunwaldem.jpg",
    note: "Poland's national history painting.",
  },
  prague: {
    id: "prague-slav-epic",
    title: "The Slav Epic: The Celebration of Svantovit",
    artist: "Alphonse Mucha",
    year: "1912",
    commonsFile: "Slavnost svatovitova na rujane.jpg",
    note: "Mucha's twenty-canvas cycle, given to Prague.",
  },
  porto: {
    id: "porto-boys-beach",
    title: "Boys on the Beach",
    artist: "Joaquín Sorolla",
    year: "1909",
    commonsFile: "Joaquín Sorolla - Chicos en la playa.jpg",
    note: "Iberian coastal light, Sorolla's lifelong subject.",
  },

  // --- Global hubs, since a job can appear anywhere ------------------------
  tokyo: {
    id: "tokyo-great-wave",
    title: "The Great Wave off Kanagawa",
    artist: "Katsushika Hokusai",
    year: "1831",
    commonsFile: "Tsunami by hokusai 19th century.jpg",
    note: "From Thirty-six Views of Mount Fuji.",
  },
  singapore: {
    id: "singapore-qingming",
    title: "A Thousand Li of Rivers and Mountains",
    artist: "Wang Ximeng",
    year: "1113",
    commonsFile: "1c Wang Ximeng. A Thousand Li of Rivers and Mountains. (51,3x1191,5cm)1113. (section) Palace museum, Beijing.jpg",
    note: "A Song dynasty handscroll, painted at eighteen.",
  },
  "hong kong": {
    id: "hongkong-qingming",
    title: "A Thousand Li of Rivers and Mountains",
    artist: "Wang Ximeng",
    year: "1113",
    commonsFile: "1c Wang Ximeng. A Thousand Li of Rivers and Mountains. (51,3x1191,5cm)1113. (section) Palace museum, Beijing.jpg",
    note: "A Song dynasty handscroll, painted at eighteen.",
  },
  "new york": {
    id: "newyork-avenue",
    title: "The Avenue in the Rain",
    artist: "Childe Hassam",
    year: "1917",
    commonsFile: "The Avenue in the Rain Frederick Childe Hassam 1917.jpeg",
    note: "Fifth Avenue, flags in the wet.",
  },
  "san francisco": {
    id: "sanfrancisco-yosemite",
    title: "Valley of the Yosemite",
    artist: "Albert Bierstadt",
    year: "1864",
    commonsFile: "Albert Bierstadt - Valley of the Yosemite - Google Art Project.jpg",
    note: "The Californian sublime.",
  },
  mumbai: {
    id: "mumbai-damayanti",
    title: "Damayanti and the Swan",
    artist: "Raja Ravi Varma",
    year: "1899",
    commonsFile: "Ravi Varma-Princess Damayanthi talking with Royal Swan about Nala.jpg",
    note: "Ravi Varma brought oil painting to Indian myth.",
  },
  bengaluru: {
    id: "bengaluru-shakuntala",
    title: "Shakuntala",
    artist: "Raja Ravi Varma",
    year: "1898",
    commonsFile: "Raja Ravi Varma - Mahabharata - Shakuntala.jpg",
    note: "From the Mahabharata, painted in Mysore.",
  },
  sydney: {
    id: "sydney-shearing",
    title: "Shearing the Rams",
    artist: "Tom Roberts",
    year: "1890",
    commonsFile: "Tom Roberts - Shearing the rams - Google Art Project.jpg",
    note: "The Heidelberg School's great labour picture.",
  },
  toronto: {
    id: "toronto-jack-pine",
    title: "The Jack Pine",
    artist: "Tom Thomson",
    year: "1917",
    commonsFile: "Tom Thomson - The Jack Pine 1916.jpg",
    note: "Algonquin Park, and the seed of the Group of Seven.",
  },
};

/** Fallback when the city is unknown but the country is not. */
export const COUNTRY_ARTWORK: Record<string, string> = {
  "united kingdom": "london",
  ireland: "dublin",
  germany: "berlin",
  netherlands: "amsterdam",
  sweden: "stockholm",
  portugal: "lisboa",
  spain: "madrid",
  france: "paris",
  italy: "rome",
  austria: "vienna",
  belgium: "brussels",
  denmark: "copenhagen",
  finland: "helsinki",
  norway: "oslo",
  switzerland: "zurich",
  poland: "warsaw",
  czechia: "prague",
  "united arab emirates": "dubai",
  singapore: "singapore",
  japan: "tokyo",
  india: "mumbai",
  australia: "sydney",
  canada: "toronto",
  "united states": "new york",
  "hong kong": "hong kong",
};

/**
 * Shown when neither city nor country resolves.
 *
 * Hokusai rather than a European painting: a remote job with no stated
 * geography should not silently look like a London one.
 */
export const DEFAULT_ARTWORK_KEY = "tokyo";

/** Every artwork that needs downloading, de-duplicated by id. */
export function allArtwork(): Artwork[] {
  const seen = new Map<string, Artwork>();
  for (const art of Object.values(CITY_ARTWORK)) seen.set(art.id, art);
  return [...seen.values()];
}
