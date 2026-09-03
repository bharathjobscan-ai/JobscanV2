import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Integration suite — needs .env.local and a reachable database.
 * Kept out of `npm test` so the unit suite stays runnable anywhere.
 *
 * `exclude` is a cost guard, not tidiness. Both excluded files set
 * `AI_PROVIDER=live` and call a real API — the benchmark bills a full scoring
 * run. They were matched by the glob, so `npm run test:integration` silently
 * spent money on 2026-09-04. They now live behind
 * `vitest.run.config.mts` and execute only via their own named scripts.
 *
 * Deliberate operations — backfills, calibration — live in `tests/ops/`, which
 * this glob does not reach.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.itest.ts", "tests/unit/*.itest.ts"],
    exclude: [
      "tests/integration/gemini-benchmark.itest.ts",
      "tests/unit/gemini-models.itest.ts",
    ],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
