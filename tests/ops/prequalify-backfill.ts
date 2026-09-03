import { describe, expect, it } from "vitest";

// Env must load before anything imports the database client, which builds a
// connection at module scope. Same arrangement as the integration suite.
process.loadEnvFile(".env.local");

const { backfillVerdicts } = await import("@/features/prequalification/mutations");

/**
 * Backfill runner, not really a test (JSV2S1038).
 *
 *   npm run prequalify:backfill
 *
 * Lives here because it needs the `@/` alias and a database, and vitest is what
 * provides both — the same arrangement as `ai:models` and `ai:bench`. Node
 * cannot resolve the path alias from a plain `.mjs`.
 *
 * Gives a verdict to jobs ingested before the gate existed. It never creates,
 * deletes or alters an application: a promoted job keeps its application, and
 * only gains the explanation and the preferred-city flag it was missing.
 */
describe("pre-qualification backfill", () => {
  it("gives every un-evaluated job a verdict", async () => {
    const result = await backfillVerdicts();

    if (result.evaluated === 0) {
      console.log("\n  Every job already has a verdict.\n");
    } else {
      console.log(`\n  Evaluated ${result.evaluated} job(s):`);
      for (const [decision, n] of Object.entries(result.byDecision)) {
        console.log(`    ${decision.padEnd(8)} ${n}`);
      }
      console.log(`    ${result.preferredCities} in a preferred city.\n`);
    }

    expect(result.evaluated).toBeGreaterThanOrEqual(0);
  });
});
