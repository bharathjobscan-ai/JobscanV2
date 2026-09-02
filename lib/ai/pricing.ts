/**
 * Token accounting for AI tasks.
 *
 * On the Pro subscription no money changes hands — these figures answer "what
 * would this cost on the metered API", and act as a proxy for how hard a run
 * draws on the subscription allowance.
 *
 * Rates are USD per million tokens. Anthropic figures are first-party API as of
 * 2026-06; Google figures are the paid tier from ai.google.dev/gemini-api/docs/pricing
 * checked 2026-09-02. Verify before relying on either for budgeting.
 *
 * `cacheRead` is given per model where it differs from the Anthropic default of
 * 10% of input — Gemini prices context caching explicitly.
 */
export const MODEL_RATES: Record<
  string,
  { input: number; output: number; cacheRead?: number }
> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-fable-5": { input: 10, output: 50 },

  // Google, prompts <= 200k tokens. Above that Pro input/output rise to 4/18.
  "gemini-3.1-pro-preview": { input: 2, output: 12, cacheRead: 0.2 },
  "gemini-2.5-pro": { input: 1.25, output: 10, cacheRead: 0.31 },
};

/**
 * Google Search grounding: 5,000 free requests per month across Gemini 3.x,
 * then $14 per 1,000. Not folded into the per-run figure, since whether a run
 * is billable depends on monthly volume — noted so it is not forgotten.
 */
export const GROUNDING_COST_PER_REQUEST = 0.014;
export const GROUNDING_FREE_PER_MONTH = 5000;

/** Cache reads bill at ~10% of input; cache writes at ~125%, unless overridden. */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** Cost reported by Claude Code itself, when it supplies one. */
  reportedCostUsd?: number;
  durationMs?: number;
};

export type CostBreakdown = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  billableTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  /** False when the model is unknown to the rate table. */
  rated: boolean;
};

export function computeCost(model: string, usage: TokenUsage): CostBreakdown {
  const rate = MODEL_RATES[model];
  const {
    inputTokens = 0,
    outputTokens = 0,
    cacheReadTokens = 0,
    cacheCreationTokens = 0,
  } = usage;

  const base = {
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    billableTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
  };

  if (!rate) {
    return { ...base, inputCost: 0, outputCost: 0, totalCost: 0, rated: false };
  }

  const inputCost =
    (inputTokens * rate.input +
      cacheReadTokens * (rate.cacheRead ?? rate.input * CACHE_READ_MULTIPLIER) +
      cacheCreationTokens * rate.input * CACHE_WRITE_MULTIPLIER) /
    1_000_000;

  const outputCost = (outputTokens * rate.output) / 1_000_000;

  return {
    ...base,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    rated: true,
  };
}

export function formatUsd(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

/** Project a per-job cost out to the cadences the user plans around. */
export function projectCost(perScore: number, perPackage: number) {
  const daily = perScore * 10 + perPackage * 2;
  return {
    daily,
    weekly: daily * 7,
    monthly: daily * 30,
  };
}
