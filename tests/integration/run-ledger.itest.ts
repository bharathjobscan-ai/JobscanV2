import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.loadEnvFile(".env.local");
process.env.AI_PROVIDER = "mock";

const { eq, like } = await import("drizzle-orm");
const { db } = await import("@/lib/db/client");
const { ingestionFailures, ingestionRuns } = await import("@/db/schema");
const { RunRecorder, startRun, withRun } = await import("@/features/ingestion/runs");
const { isolate, isolateAll, withRetry, RetryExhausted } = await import(
  "@/features/ingestion/reliability"
);

/**
 * JSV2S1010–1015 — the ingestion run ledger, against the real database.
 *
 * Migration 0005 created `ingestion_runs` and `ingestion_failures` and nothing
 * exercised either table, so six stories sat at `Review` describing behaviour
 * no test had ever observed. These assertions are what let them close.
 *
 * Every run this file opens uses a source prefixed `qa_` so cleanup can delete
 * by source alone. The lesson from 2026-09-04 stands: a cleanup that could
 * match real data is a destructive test.
 */
const QA_SOURCE = "qa_ledger_fixture";
const QA_PREFIX = "qa_";

async function cleanup() {
  // ingestion_failures cascades from ingestion_runs, so deleting runs is enough.
  await db.delete(ingestionRuns).where(like(ingestionRuns.source, `${QA_PREFIX}%`));
}

beforeAll(cleanup);
afterAll(cleanup);

async function runRow(id: string) {
  const [row] = await db.select().from(ingestionRuns).where(eq(ingestionRuns.id, id));
  return row;
}

describe("JSV2S1010 — the run row", () => {
  it("opens at running before any work happens, then closes with counts", async () => {
    const run = await startRun({ source: QA_SOURCE, trigger: "scheduled" });

    const opened = await runRow(run.id);
    expect(opened.status).toBe("running");
    expect(opened.finishedAt).toBeNull();
    expect(opened.startedAt).toBeTruthy();

    run.count("fetched", 10);
    run.count("inserted", 7);
    run.count("duplicates", 3);
    await run.close();

    const closed = await runRow(run.id);
    expect(closed.status).toBe("succeeded");
    expect(closed.fetched).toBe(10);
    expect(closed.inserted).toBe(7);
    expect(closed.duplicates).toBe(3);
    expect(closed.finishedAt).toBeTruthy();
    expect(closed.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records the parameters a run was invoked with", async () => {
    const run = await startRun({
      source: QA_SOURCE,
      trigger: "backfill",
      params: { keywords: ["product manager"], limit: 25 },
    });
    await run.close();

    const row = await runRow(run.id);
    expect(row.trigger).toBe("backfill");
    expect(row.params).toMatchObject({ limit: 25 });
  });
});

describe("JSV2S1011 — logging", () => {
  it("keeps one entry per stage, with the stage that produced it", async () => {
    const run = await startRun({ source: QA_SOURCE, trigger: "manual_upload" });
    run.log("fetch", "info", "Fetched 3 rows");
    run.log("dedupe", "warn", "Two near-duplicates", { hashes: 2 });
    await run.close();

    const logs = (await runRow(run.id)).logs ?? [];
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ stage: "fetch", level: "info" });
    expect(logs[1]).toMatchObject({ stage: "dedupe", level: "warn" });
    // Without a timestamp a log line cannot be correlated with anything else.
    expect(logs[1].at).toBeTruthy();
  });
});

describe("JSV2S1012 — metrics and JSV2S1013 — partial is not failed", () => {
  it("reports partial when some rows landed and some did not", async () => {
    const run = await startRun({ source: QA_SOURCE, trigger: "scheduled" });
    run.count("fetched", 5);
    run.count("inserted", 4);
    run.fail("validate", { title: "broken" }, "No job URL");
    const status = await run.close();

    // The distinction the story exists for: collapsing this into `failed` hides
    // four successful inserts, and into `succeeded` hides a rejected row.
    expect(status).toBe("partial");
    expect((await runRow(run.id)).rejected).toBe(1);
  });

  it("reports failed when the run itself threw", async () => {
    const { status, result } = await withRun(
      { source: QA_SOURCE, trigger: "scheduled" },
      async () => {
        throw new Error("source unreachable");
      },
    );

    expect(status).toBe("failed");
    expect(result).toBeNull();

    const [row] = await db
      .select()
      .from(ingestionRuns)
      .where(eq(ingestionRuns.source, QA_SOURCE))
      .orderBy(ingestionRuns.startedAt);
    expect(row).toBeTruthy();
  });

  it("closes the run row even when the work throws — no run stuck at running", async () => {
    const { runId } = await withRun(
      { source: QA_SOURCE, trigger: "scheduled" },
      async () => {
        throw new Error("boom");
      },
    );

    const row = await runRow(runId);
    expect(row.status).toBe("failed");
    expect(row.finishedAt).toBeTruthy();
    expect(row.error).toContain("boom");
  });
});

describe("JSV2S1013 — source failure isolation", () => {
  it("one failing source does not end the run", async () => {
    const outcomes = await isolateAll(
      ["good", "bad", "also-good"],
      async (name: string) => {
        if (name === "bad") throw new Error("that source is down");
        return name.toUpperCase();
      },
    );

    expect(outcomes.filter((o) => o.result.ok)).toHaveLength(2);
    expect(outcomes.filter((o) => !o.result.ok)).toHaveLength(1);

    // The pair carries the item, so a partial run can name which source failed
    // rather than only reporting that one did.
    const failed = outcomes.find((o) => !o.result.ok);
    expect(failed?.item).toBe("bad");
  });

  it("isolate returns the error rather than throwing it", async () => {
    const outcome = await isolate(async () => {
      throw new Error("contained");
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect((outcome.error as Error).message).toBe("contained");
  });
});

describe("JSV2S1014 — retry and backoff", () => {
  it("retries a transient failure and succeeds", async () => {
    let attempts = 0;
    const value = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          const error = new Error("rate limited") as Error & { status?: number };
          error.status = 429;
          throw error;
        }
        return "ok";
      },
      { attempts: 3, baseDelayMs: 1 },
    );

    expect(value).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry a 4xx — a bad request fails once, not three times", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          const error = new Error("bad request") as Error & { status?: number };
          error.status = 400;
          throw error;
        },
        { attempts: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow();

    expect(attempts).toBe(1);
  });

  it("gives up after the configured attempts", async () => {
    await expect(
      withRetry(
        async () => {
          const error = new Error("still down") as Error & { status?: number };
          error.status = 503;
          throw error;
        },
        { attempts: 2, baseDelayMs: 1 },
      ),
    ).rejects.toBeInstanceOf(RetryExhausted);
  });
});

describe("JSV2S1015 — the dead-letter queue", () => {
  it("writes one failure row per rejected record, buffered into one insert", async () => {
    const run = await startRun({ source: QA_SOURCE, trigger: "scheduled" });
    run.fail("validate", { title: "no url" }, "Missing job_url");
    run.fail("map", { title: "bad date" }, "Unparseable posted_at");
    await run.close();

    const rows = await db
      .select()
      .from(ingestionFailures)
      .where(eq(ingestionFailures.runId, run.id));

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.stage).sort()).toEqual(["map", "validate"]);
    // The payload is kept so a rejected row can be reprocessed, not just counted.
    expect(rows.find((r) => r.stage === "validate")?.payload).toMatchObject({
      title: "no url",
    });
    expect(rows.every((r) => r.reprocessedAt === null)).toBe(true);
  });

  it("cascades failures away with the run", async () => {
    const run = await startRun({ source: QA_SOURCE, trigger: "scheduled" });
    run.fail("persist", { title: "x" }, "duplicate key");
    await run.close();

    await db.delete(ingestionRuns).where(eq(ingestionRuns.id, run.id));

    const orphans = await db
      .select()
      .from(ingestionFailures)
      .where(eq(ingestionFailures.runId, run.id));
    expect(orphans).toHaveLength(0);
  });

  it("a run with no failures writes no failure rows", async () => {
    const run = await startRun({ source: QA_SOURCE, trigger: "scheduled" });
    run.count("inserted", 2);
    await run.close();

    const rows = await db
      .select()
      .from(ingestionFailures)
      .where(eq(ingestionFailures.runId, run.id));
    expect(rows).toHaveLength(0);
  });
});

describe("RunRecorder is not a database round trip per event", () => {
  it("accumulates in memory and writes once on close", async () => {
    const run = await startRun({ source: QA_SOURCE, trigger: "scheduled" });
    for (let i = 0; i < 50; i++) run.fail("validate", { i }, "bad row");

    // Nothing is persisted before close — that is the whole point of buffering.
    const before = await db
      .select()
      .from(ingestionFailures)
      .where(eq(ingestionFailures.runId, run.id));
    expect(before).toHaveLength(0);

    await run.close();

    const after = await db
      .select()
      .from(ingestionFailures)
      .where(eq(ingestionFailures.runId, run.id));
    expect(after).toHaveLength(50);
    expect(run instanceof RunRecorder).toBe(true);
  });
});
