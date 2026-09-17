/**
 * Download the location artwork into /public (JSV2S1143).
 *
 *   npm run artwork:fetch          # fetch anything missing
 *   npm run artwork:fetch -- --all # re-fetch everything
 *
 * Fetched once and committed rather than hotlinked, so the page has no
 * third-party runtime dependency: a Wikimedia outage cannot blank the UI, and
 * no viewer's browser ever calls out to a third party.
 *
 * Every filename is VERIFIED, not assumed. A wrong Commons name returns an
 * error page, and writing that to disk would produce a broken image that looks
 * like a CSS bug. The script reports each failure by name instead.
 */
process.loadEnvFile?.(".env.local");

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const { allArtwork } = await import("@/config/artwork");

const OUT_DIR = path.join(process.cwd(), "public", "artwork");
/**
 * The artwork is a faded backdrop behind text, not a print. 1600px cost 34MB
 * across the set — permanent weight in git history for pixels no one can see
 * at 12% opacity. 1000px is still sharp on a retina display at this size.
 */
const WIDTH = 1000;

/** Commons resolves a file name to the actual image via Special:FilePath. */
function filePathUrl(commonsFile: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    commonsFile,
  )}?width=${WIDTH}`;
}

async function main() {
  const refetch = process.argv.includes("--all");
  mkdirSync(OUT_DIR, { recursive: true });

  const items = allArtwork();
  console.log(`${items.length} artworks; output ${OUT_DIR}\n`);

  const failed: { id: string; reason: string }[] = [];
  let written = 0;
  let skipped = 0;

  for (const art of items) {
    const target = path.join(OUT_DIR, `${art.id}.jpg`);
    if (!refetch && existsSync(target)) {
      skipped += 1;
      continue;
    }

    try {
      const res = await fetch(filePathUrl(art.commonsFile), {
        // Commons asks for a descriptive agent and will throttle without one.
        headers: { "user-agent": "JobScanV2/1.0 (personal job tracker)" },
        redirect: "follow",
      });

      if (!res.ok) {
        failed.push({ id: art.id, reason: `HTTP ${res.status} — check commonsFile` });
        continue;
      }

      const type = res.headers.get("content-type") ?? "";
      // An HTML body means Commons served an error page, not an image.
      if (!type.startsWith("image/")) {
        failed.push({ id: art.id, reason: `not an image (${type})` });
        continue;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      // A few hundred bytes is a placeholder, not a painting.
      if (buffer.byteLength < 10_000) {
        failed.push({ id: art.id, reason: `suspiciously small (${buffer.byteLength}B)` });
        continue;
      }

      writeFileSync(target, buffer);
      written += 1;
      console.log(
        `  ok   ${art.id.padEnd(26)} ${(buffer.byteLength / 1024).toFixed(0)}KB  ${art.title}`,
      );
    } catch (error) {
      failed.push({ id: art.id, reason: error instanceof Error ? error.message : "failed" });
    }
  }

  console.log(`\nwritten ${written}, already present ${skipped}, failed ${failed.length}`);
  for (const f of failed) console.log(`  FAIL ${f.id.padEnd(26)} ${f.reason}`);

  // Non-zero on failure so this can never quietly half-succeed in CI.
  if (failed.length > 0) process.exitCode = 1;
}

await main();
