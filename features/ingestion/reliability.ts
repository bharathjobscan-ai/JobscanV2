/**
 * JSV2S1013 (failure isolation) and JSV2S1014 (retry/backoff).
 *
 * Deliberately dependency-free and database-free: these are the primitives the
 * scheduled orchestrator is built from, and they must be unit-testable without
 * a live database or a live API.
 */

export class RetryExhausted extends Error {
  constructor(
    readonly attempts: number,
    readonly lastError: unknown,
  ) {
    super(
      `Gave up after ${attempts} attempt${attempts === 1 ? "" : "s"}: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
    this.name = "RetryExhausted";
  }
}

export type RetryOptions = {
  attempts?: number;
  /** Delay before the first retry, in ms. Doubles each attempt. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Injectable so tests do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Deterministic jitter source, 0..1. Injectable for the same reason. */
  random?: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Whether an error is worth retrying.
 *
 * Retrying a 400 just burns quota and rate limit — the request is wrong and
 * will stay wrong. Retrying a 429 or a 5xx is the whole point. Anything we
 * cannot classify is treated as retryable, because a transient network error
 * often surfaces as an opaque `fetch failed`.
 */
/**
 * A provider refusing on budget, which no amount of waiting fixes
 * (JSV2S1148, found live 2026-09-21).
 *
 * A 429 normally means "too fast, try again" and retrying is correct. A 429
 * from a spend cap means "you have spent your allowance this month" and
 * retrying is pure waste — three attempts per job, across every job in a pass,
 * all certain to fail.
 *
 * Matched on the message because the shape differs by provider, and because
 * the Gemini SDK reports `status: "RESOURCE_EXHAUSTED"` — a STRING. `Number()`
 * of that is NaN, which failed the numeric test below and fell through to the
 * "cannot classify, so retry" default. The cap was retried by accident rather
 * than by decision.
 */
export function isSpendCapError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error ?? "");

  return /spending cap|spend cap|quota.*exceeded|exceeded.*quota|billing.*(disabled|required)|insufficient[_ ]quota|RESOURCE_EXHAUSTED/i.test(
    message,
  );
}

export function isRetryable(error: unknown): boolean {
  // Checked before anything else: a spend cap is permanent for the month, and
  // it arrives wearing a status code that otherwise means "retry me".
  if (isSpendCapError(error)) return false;

  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : undefined;

  if (status !== undefined && Number.isFinite(status)) {
    if (status === 408 || status === 425 || status === 429) return true;
    return status >= 500;
  }
  return true;
}

/** Full jitter: delay is uniform in [0, backoff], which avoids retry convoys. */
export function backoffDelay(
  attempt: number,
  { baseDelayMs = 500, maxDelayMs = 30_000 }: RetryOptions = {},
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
  return Math.round(ceiling * random());
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 3,
    sleep = defaultSleep,
    random = Math.random,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // A permanent error must fail immediately, not after three identical tries.
      if (!isRetryable(error) || attempt === attempts) break;

      const delayMs = backoffDelay(attempt, options, random);
      onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }

  throw new RetryExhausted(attempts, lastError);
}

export type Isolated<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

/**
 * Run one unit of work so its failure cannot take down the batch (JSV2S1013).
 *
 * Returns the failure rather than throwing, which forces the caller to decide
 * what a partial result means instead of letting an exception unwind the run.
 */
export async function isolate<T>(operation: () => Promise<T>): Promise<Isolated<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/** Isolate every item, so one bad source or row never stops the others. */
export async function isolateAll<I, T>(
  items: readonly I[],
  operation: (item: I) => Promise<T>,
): Promise<{ item: I; result: Isolated<T> }[]> {
  return Promise.all(
    items.map(async (item) => ({ item, result: await isolate(() => operation(item)) })),
  );
}
