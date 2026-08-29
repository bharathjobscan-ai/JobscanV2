/**
 * Token accounting for AI tasks.
 *
 * On the Pro subscription no money changes hands — these figures answer "what
 * would this cost on the metered API", and act as a proxy for how hard a run
 * draws on the subscription allowance.
 *
 * Rates are USD per million tokens, first-party Anthropic API, as of 2026-06.
 * Verify against anthropic.com/pricing before relying on them for budgeting.
 */
export const MODEL_RATES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-fable-5": { input: 10, output: 50 },
};

/** Cache reads bill at ~10% of input; cache writes at ~125%. */
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
      cacheReadTokens * rate.input * CACHE_READ_MULTIPLIER +
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
