import { describe, expect, it } from "vitest";

import { summariseRuns, type CostableRun } from "@/features/ai/cost";

const base: Omit<CostableRun, "id" | "taskType" | "model" | "usage"> = {
  provider: "anthropic_api",
  allowedTools: null,
  finishedAt: new Date("2026-09-01T10:00:00Z"),
};

const usage = (input: number, output: number, extra = {}) => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  ...extra,
});

function run(over: Partial<CostableRun> = {}): CostableRun {
  return {
    ...base,
    id: "r1",
    taskType: "score",
    model: "claude-sonnet-5",
    usage: usage(1_000_000, 1_000_000),
    ...over,
  };
}

describe("summariseRuns", () => {
  it("totals cost per run from measured tokens", () => {
    // Sonnet 5 is $2/M in, $10/M out.
    const result = summariseRuns([run()]);

    expect(result.runs).toHaveLength(1);
    expect(result.totalUsd).toBeCloseTo(12, 6);
    expect(result.runs[0].cost?.rated).toBe(true);
  });

  it("groups by task and by model, largest spend first", () => {
    const result = summariseRuns([
      run({ id: "a", taskType: "score", model: "claude-sonnet-5" }),
      run({
        id: "b",
        taskType: "tailor_cv",
        model: "claude-opus-5",
        usage: usage(1_000_000, 1_000_000),
      }),
    ]);

    // Opus ($5/$25 = $30) outspends Sonnet ($12), so it sorts first.
    expect(result.byModel.map((m) => m.key)).toEqual([
      "claude-opus-5",
      "claude-sonnet-5",
    ]);
    expect(result.byTask.map((t) => t.key)).toEqual(["tailor_cv", "score"]);
    expect(result.totalUsd).toBeCloseTo(42, 6);
  });

  /**
   * The failure that matters: an unknown model priced at zero would quietly
   * understate spend. It must be visible as unrated instead.
   */
  it("excludes an unrated model from the total and counts it", () => {
    const result = summariseRuns([run({ model: "some-future-model" })]);

    expect(result.totalUsd).toBe(0);
    expect(result.unratedRuns).toBe(1);
    expect(result.runs[0].cost?.rated).toBe(false);
  });

  it("treats a run with no reported usage as unmeasured, not free", () => {
    const result = summariseRuns([run({ usage: null })]);

    expect(result.unmeasuredRuns).toBe(1);
    expect(result.runs[0].cost).toBeNull();
    expect(result.totalUsd).toBe(0);
  });

  it("counts grounded runs and prices them separately", () => {
    const result = summariseRuns([
      run({ allowedTools: "GoogleSearch", provider: "gemini_api" }),
      run({ id: "r2" }),
    ]);

    expect(result.groundedRuns).toBe(1);
    expect(result.groundingUsdIfBillable).toBeCloseTo(0.014, 6);
    // Grounding is never folded into the token total.
    expect(result.totalUsd).toBeCloseTo(24, 6);
  });

  it("returns an empty summary for an application with no runs", () => {
    const result = summariseRuns([]);
    expect(result.runs).toEqual([]);
    expect(result.totalUsd).toBe(0);
    expect(result.byTask).toEqual([]);
  });
});

/** JSV2S1142 — the split the spend decision turns on. */
describe("cost buckets", () => {
  const run = (taskType: string, inputTokens: number) => ({
    id: taskType + inputTokens,
    taskType: taskType as never,
    provider: "anthropic_api",
    model: "claude-sonnet-5",
    allowedTools: null,
    usage: { inputTokens, outputTokens: 500, cacheReadTokens: 0, cacheCreationTokens: 0 },
    finishedAt: new Date(),
  });

  it("folds the CV and cover letter into one line, because one call makes both", () => {
    const summary = summariseRuns([
      run("score", 4000),
      run("tailor_cv", 6000),
      run("cover_letter", 3000),
      run("simg", 5000),
    ]);

    expect(summary.byBucket.map((b) => b.key).sort()).toEqual([
      "documents",
      "evaluation",
      "scoring",
    ]);
    expect(summary.byBucket.find((b) => b.key === "documents")?.runs).toBe(2);
  });

  it("reports SimG's share so the run-it-every-time question is answerable", () => {
    const summary = summariseRuns([run("tailor_cv", 6000), run("simg", 6000)]);
    // Identical usage on both, so SimG is exactly half the spend.
    expect(summary.evaluationShare).toBeCloseTo(0.5, 2);
  });

  it("reports a zero share rather than NaN when nothing has been spent", () => {
    expect(summariseRuns([]).evaluationShare).toBe(0);
  });
});
