import { eq, sql } from "drizzle-orm";

import {
  ingestionFailures,
  ingestionRuns,
  type IngestionLogEntry,
  type NewIngestionFailure,
} from "@/db/schema";
import type {
  IngestionRunStatus,
  IngestionStage,
  IngestionTrigger,
} from "@/lib/config/constants";
import { db } from "@/lib/db/client";
import { statusFor, ZERO_METRICS, type RunMetrics } from "./run-metrics";

export { statusFor, ZERO_METRICS, type RunMetrics } from "./run-metrics";

/**
 * JSV2S1010–1012, 1015 — recording what an ingestion run did.
 *
 * A run is opened before any work happens and closed in a `finally`, so a run
 * that crashes leaves a `running` row with an error rather than no row at all.
 * "Nothing was recorded" and "the fetch returned nothing" must never look the
 * same from the outside.
 */

/** An open run, accumulating counts and logs in memory until it is closed. */
export class RunRecorder {
  readonly metrics: RunMetrics = { ...ZERO_METRICS };
  private readonly logs: IngestionLogEntry[] = [];
  private readonly pendingFailures: Omit<NewIngestionFailure, "runId">[] = [];
  private readonly startedAt = Date.now();

  constructor(
    readonly id: string,
    readonly source: string,
  ) {}

  log(
    stage: IngestionStage,
    level: IngestionLogEntry["level"],
    message: string,
    detail?: Record<string, unknown>,
  ): void {
    this.logs.push({
      stage,
      level,
      message,
      at: new Date().toISOString(),
      ...(detail ? { detail } : {}),
    });
  }

  count(metric: keyof RunMetrics, by = 1): void {
    this.metrics[metric] += by;
  }

  /**
   * Record a row that could not be processed (JSV2S1015).
   *
   * Buffered rather than written immediately so a run makes one insert instead
   * of one per bad row — a fetch of 500 malformed records should not become 500
   * round trips to a database on another continent.
   */
  fail(stage: IngestionStage, payload: unknown, error: string): void {
    this.metrics.rejected += 1;
    this.pendingFailures.push({
      source: this.source,
      stage,
      payload: payload as NewIngestionFailure["payload"],
      error,
    });
    this.log(stage, "error", error);
  }

  async close(runError?: unknown): Promise<IngestionRunStatus> {
    const status = statusFor(this.metrics, runError !== undefined);

    await db.transaction(async (tx) => {
      if (this.pendingFailures.length > 0) {
        await tx
          .insert(ingestionFailures)
          .values(this.pendingFailures.map((f) => ({ ...f, runId: this.id })));
      }

      await tx
        .update(ingestionRuns)
        .set({
          ...this.metrics,
          status,
          logs: this.logs,
          error:
            runError === undefined
              ? null
              : runError instanceof Error
                ? runError.message
                : String(runError),
          finishedAt: sql`now()`,
          durationMs: Date.now() - this.startedAt,
        })
        .where(eq(ingestionRuns.id, this.id));
    });

    return status;
  }
}

export async function startRun(input: {
  source: string;
  trigger: IngestionTrigger;
  params?: Record<string, unknown>;
}): Promise<RunRecorder> {
  const [row] = await db
    .insert(ingestionRuns)
    .values({
      source: input.source,
      trigger: input.trigger,
      params: input.params ?? null,
      status: "running",
    })
    .returning({ id: ingestionRuns.id });

  return new RunRecorder(row.id, input.source);
}

/**
 * Run a source end to end, guaranteeing the run row is closed.
 *
 * The `finally` is the point: without it a thrown error leaves a run stuck at
 * `running` forever, and a stuck run is indistinguishable from one still in
 * flight.
 */
export async function withRun<T>(
  input: Parameters<typeof startRun>[0],
  work: (run: RunRecorder) => Promise<T>,
): Promise<{ result: T | null; status: IngestionRunStatus; runId: string }> {
  const run = await startRun(input);
  let result: T | null = null;
  let failure: unknown;

  try {
    result = await work(run);
  } catch (error) {
    failure = error;
    run.log("fetch", "error", "Run aborted", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const status = await run.close(failure);
  return { result, status, runId: run.id };
}
