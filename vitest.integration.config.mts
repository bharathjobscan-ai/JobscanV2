import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Integration suite — needs .env.local and a reachable database.
 * Kept out of `npm test` so the unit suite stays runnable anywhere.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.itest.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
