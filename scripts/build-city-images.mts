/**
 * Turn the curated city photographs into what the UI actually loads
 * (JSV2S1172).
 *
 *   npm run cities:build
 *
 * Sources live in `assets/city-source/` (gitignored — originals run 1-7 MB
 * each and the whole repo is 22 MB). Only the derivatives are committed, the
 * way `public/artwork/` holds the paintings: fetched once, served locally, no
 * third-party request at render time and no per-render network call.
 *
 * THREE THINGS IT DOES THAT A PLAIN RESIZE WOULD NOT:
 *
 * 1. **Assigns the wider source to the hero.** The hero is a 2.4:1 banner and
 *    the card is 3:2, so width is the scarce resource. Several cities arrived
 *    with a `-card` file far wider than their `-hero` file (Berlin 6960 against
 *    1536), and honouring the filenames would have thrown that away.
 * 2. **Never upscales.** Where no source reaches 2400px the hero is built at
 *    the width that exists and the shortfall is REPORTED. Inventing pixels
 *    would hide a fixable sourcing problem behind a soft image.
 * 3. **Emits a blur placeholder** so eight cards do not pop in one by one.
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = "assets/city-source";
const OUT = "public/cities";

/** 3:2 — the card. Generous enough for a 2x display at ~600 CSS px wide. */
const CARD = { w: 1200, h: 800 };
/** 2.4:1 — the hero banner. Width is capped by the source, never invented. */
const HERO_MAX_W = 2400;
const HERO_RATIO = 2.4;

type Source = { file: string; width: number; height: number };

const files = readdirSync(SRC).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
const byCity = new Map<string, Source[]>();

for (const file of files) {
  const city = file.replace(/-(card|hero)\.(jpe?g|png|webp)$/i, "").toLowerCase();
  const meta = await sharp(path.join(SRC, file)).metadata();
  if (!meta.width || !meta.height) {
    console.error(`  ${file}: unreadable, skipped`);
    continue;
  }
  const list = byCity.get(city) ?? [];
  list.push({ file, width: meta.width, height: meta.height });
  byCity.set(city, list);
}

mkdirSync(OUT, { recursive: true });

const entries: Record<string, { card: string; hero: string; blur: string }> = {};
const warnings: string[] = [];

for (const [city, sources] of [...byCity.entries()].sort()) {
  // Widest to the hero; the other to the card. Filenames are a hint, not an
  // instruction — the geometry decides.
  const ordered = [...sources].sort((a, b) => b.width - a.width);
  const heroSrc = ordered[0];
  const cardSrc = ordered[1] ?? ordered[0];

  const heroW = Math.min(HERO_MAX_W, heroSrc.width);
  const heroH = Math.round(heroW / HERO_RATIO);

  if (heroW < HERO_MAX_W) {
    warnings.push(
      `${city}: hero is ${heroW}px wide, short of ${HERO_MAX_W} — soft on a 2x display`,
    );
  }
  if (cardSrc.width < CARD.w) {
    warnings.push(`${city}: card source is only ${cardSrc.width}px wide`);
  }

  await sharp(path.join(SRC, cardSrc.file))
    .resize(CARD.w, CARD.h, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toFile(path.join(OUT, `${city}-card.webp`));

  await sharp(path.join(SRC, heroSrc.file))
    .resize(heroW, heroH, { fit: "cover", position: "attention" })
    .webp({ quality: 80 })
    .toFile(path.join(OUT, `${city}-hero.webp`));

  // 20px wide, inlined in the config: enough to carry the dominant colours
  // while staying small enough that shipping eight of them costs nothing.
  const blur = await sharp(path.join(SRC, cardSrc.file))
    .resize(20, 13, { fit: "cover" })
    .webp({ quality: 45 })
    .toBuffer();

  entries[city] = {
    card: `/cities/${city}-card.webp`,
    hero: `/cities/${city}-hero.webp`,
    blur: `data:image/webp;base64,${blur.toString("base64")}`,
  };

  console.log(
    `${city.padEnd(12)} card ${CARD.w}x${CARD.h} from ${cardSrc.file.padEnd(22)} · ` +
      `hero ${heroW}x${heroH} from ${heroSrc.file}`,
  );
}

writeFileSync(
  "config/cities/images.generated.json",
  JSON.stringify(entries, null, 2) + "\n",
);

console.log(`\n${Object.keys(entries).length} cities written to ${OUT}`);
if (warnings.length > 0) {
  console.log("\nWorth knowing:");
  for (const w of warnings) console.log(`  ${w}`);
}
