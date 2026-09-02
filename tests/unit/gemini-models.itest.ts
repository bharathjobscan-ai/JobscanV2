/**
 * Lists the Gemini models the key can reach, so a model name is chosen from
 * what exists rather than guessed.
 *
 *   npm run ai:models
 */
import { describe, expect, it } from "vitest";

process.loadEnvFile(".env.local");

describe("gemini models", () => {
  it("lists what this key can reach", async () => {
    const { listGeminiModels } = await import("@/lib/ai/gemini");
    const models = await listGeminiModels();
    const interesting = models.filter((m) => /gemini-[23]/.test(m));
    console.log("\nAvailable Gemini models:\n" + interesting.map((m) => "  " + m).join("\n"));
    expect(models.length).toBeGreaterThan(0);
  }, 60_000);
});
