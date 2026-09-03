import { describe, expect, it, vi } from "vitest";

import {
  backoffDelay,
  isolate,
  isolateAll,
  isRetryable,
  RetryExhausted,
  withRetry,
} from "@/features/ingestion/reliability";
import { statusFor, type RunMetrics } from "@/features/ingestion/run-metrics";

const noSleep = async () => {};

describe("isRetryable", () => {
  it("retries rate limits and server errors", () => {
    expect(isRetryable({ status: 429 })).toBe(true);
    expect(isRetryable({ status: 503 })).toBe(true);
    expect(isRetryable({ status: 408 })).toBe(true);
  });

  /** Retrying a bad request burns quota on a call that cannot succeed. */
  it("does not retry client errors", () => {
    expect(isRetryable({ status: 400 })).toBe(false);
    expect(isRetryable({ status: 401 })).toBe(false);
    expect(isRetryable({ status: 404 })).toBe(false);
  });

  it("retries unclassifiable errors, which are usually transient network faults", () => {
    expect(isRetryable(new Error("fetch failed"))).toBe(true);
  });
});

describe("backoffDelay", () => {
  it("doubles the ceiling per attempt and applies full jitter", () => {
    const full = () => 1;
    expect(backoffDelay(1, { baseDelayMs: 500 }, full)).toBe(500);
    expect(backoffDelay(2, { baseDelayMs: 500 }, full)).toBe(1000);
    expect(backoffDelay(3, { baseDelayMs: 500 }, full)).toBe(2000);
  });

  it("caps at maxDelayMs", () => {
    expect(backoffDelay(20, { baseDelayMs: 500, maxDelayMs: 30_000 }, () => 1)).toBe(
      30_000,
    );
  });

  it("jitters down to avoid retry convoys", () => {
    expect(backoffDelay(3, { baseDelayMs: 500 }, () => 0)).toBe(0);
  });
});

describe("withRetry", () => {
  it("returns the first success without sleeping", async () => {
    const op = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(op, { sleep: noSleep })).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and then succeeds", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValue("recovered");

    await expect(withRetry(op, { sleep: noSleep, random: () => 0 })).resolves.toBe(
      "recovered",
    );
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("gives up after the attempt budget", async () => {
    const op = vi.fn().mockRejectedValue({ status: 500 });
    await expect(
      withRetry(op, { attempts: 3, sleep: noSleep, random: () => 0 }),
    ).rejects.toBeInstanceOf(RetryExhausted);
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("fails immediately on a permanent error", async () => {
    const op = vi.fn().mockRejectedValue({ status: 400 });
    await expect(
      withRetry(op, { attempts: 5, sleep: noSleep }),
    ).rejects.toBeInstanceOf(RetryExhausted);
    expect(op).toHaveBeenCalledTimes(1);
  });
});

describe("isolate", () => {
  it("returns a failure instead of throwing, so a batch continues", async () => {
    const result = await isolate(async () => {
      throw new Error("row 3 is malformed");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("row 3 is malformed");
  });

  it("keeps good items when one item fails", async () => {
    const results = await isolateAll([1, 2, 3], async (n) => {
      if (n === 2) throw new Error("bad");
      return n * 10;
    });

    expect(results.map((r) => r.result.ok)).toEqual([true, false, true]);
    expect(results.filter((r) => r.result.ok)).toHaveLength(2);
  });
});

describe("statusFor", () => {
  const metrics = (over: Partial<RunMetrics> = {}): RunMetrics => ({
    fetched: 0,
    inserted: 0,
    duplicates: 0,
    updated: 0,
    reposted: 0,
    rejected: 0,
    ...over,
  });

  it("succeeds when nothing was rejected", () => {
    expect(statusFor(metrics({ fetched: 10, inserted: 10 }), false)).toBe("succeeded");
  });

  /** The case the status exists for: some rows landed, some did not. */
  it("reports partial when some rows landed and some were rejected", () => {
    expect(statusFor(metrics({ fetched: 10, inserted: 8, rejected: 2 }), false)).toBe(
      "partial",
    );
  });

  it("reports failed when everything was rejected", () => {
    expect(statusFor(metrics({ fetched: 5, rejected: 5 }), false)).toBe("failed");
  });

  it("reports failed when the run itself threw, regardless of counts", () => {
    expect(statusFor(metrics({ inserted: 3 }), true)).toBe("failed");
  });

  it("counts duplicates as landed, not lost", () => {
    expect(statusFor(metrics({ fetched: 4, duplicates: 3, rejected: 1 }), false)).toBe(
      "partial",
    );
  });
});
