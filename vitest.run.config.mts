import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Deliberate operations, not tests.
 *
 * Backfills, calibration reports and paid benchmarks — things you run on
 * purpose, one at a time, never as part of a suite. They live under a separate
 * config because `vitest.integration.config.mts` excludes them, and vitest
 * applies `exclude` even to a file named explicitly on the command line.
 *
 * Keeping the exclusion is the point: one of these mutates real rows and one
 * bills a real API call, and neither should ever be swept up by a glob.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/ops/**/*.ts", "tests/integration/gemini-benchmark.itest.ts", "tests/unit/gemini-models.itest.ts"],
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
