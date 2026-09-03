import { and, eq, inArray, or, sql } from "drizzle-orm";

import {
  applicationEvents,
  applications,
  rawJobs,
  type NewApplicationEvent,
  type NewRawJob,
} from "@/db/schema";
import { GATING_TRIGGERS } from "@/config/prequalification";
import { prequalify } from "@/features/prequalification/engine";
import type { PreQualificationResult } from "@/features/prequalification/types";
import type { IngestionTrigger, PrequalDecision } from "@/lib/config/constants";
import { db } from "@/lib/db/client";
import { jobFingerprint } from "./fingerprint";
import { contentHash } from "./lifecycle";
import { isIncomplete, parseUploadRow, type UploadRow } from "./schema";
import { normaliseUpload } from "./shapes";

export type RowOutcome = {
  rowNumber: number;
  /**
   * `rejected` is a *validation* failure — the row never became a job.
   * `screened_out` is pre-qualification — the job exists but has no
   * application. Conflating them would make an unparseable row and a
   * deliberately-filtered one indistinguishable in the upload summary.
   */
  status: "inserted" | "duplicate" | "rejected" | "screened_out";
  title?: string;
  company?: string;
  /** Why it was rejected, or which rule matched for a duplicate. */
  reason?: string;
  incomplete?: boolean;
  applicationId?: string;
  prequalification?: PrequalDecision;
};

export type IngestResult = {
  total: number;
  inserted: number;
  duplicate: number;
  rejected: number;
  screenedOut: number;
  incomplete: number;
  rows: RowOutcome[];
};

export type IngestOptions = {
  /**
   * Which trigger this run represents. All triggers gate as of 2026-09-04 —
   * see `GATING_TRIGGERS`. The field remains because the trigger is recorded on
   * the run and shapes the timeline wording, and because exempting a trigger
   * later should be a config change rather than a code change.
   */
  trigger?: IngestionTrigger;
};

type Prepared = {
  rowNumber: number;
  value: UploadRow;
  raw: Record<string, unknown>;
  fingerprint: string;
};

/**
 * Run records through the pipeline: normalise shape → validate → dedupe →
 * pre-qualify → persist.
 *
 * D1, as amended by ADR-0006: a job becomes an application **only if it passes
 * pre-qualification**. Everything else keeps its `raw_jobs` row and waits in the
 * review queue. Nothing is discarded.
 *
 * A malformed row never aborts the batch (JSV2S1033).
 */
export async function ingestRows(
  records: Record<string, unknown>[],
  options: IngestOptions = {},
): Promise<IngestResult> {
  const trigger = options.trigger ?? "manual_upload";
  const gating = GATING_TRIGGERS.includes(trigger);

  // An Apify export and the upload template are different shapes; the actor
  // file has no `source` column at all, so every row would be rejected. Both
  // are brought to the canonical shape by the same mapper the live adapter
  // uses, so a backfill and a nightly fetch produce identical rows.
  const upload = normaliseUpload(records);
  const shapeFailures = upload.failures;
  records = upload.records;
  const outcomes: RowOutcome[] = [];
  const prepared: Prepared[] = [];

  for (const [index, failure] of shapeFailures.entries()) {
    outcomes.push({
      rowNumber: -(index + 1),
      status: "rejected",
      reason: `could not be mapped from the ${upload.shape} format: ${failure.error}`,
    });
  }

  // --- 1. Validate ---------------------------------------------------------
  records.forEach((record, index) => {
    const rowNumber = index + 1;
    const parsed = parseUploadRow(record);

    if (!parsed.ok) {
      outcomes.push({
        rowNumber,
        status: "rejected",
        title: typeof record.title === "string" ? record.title : undefined,
        reason: parsed.errors.map((e) => `${e.field}: ${e.message}`).join("; "),
      });
      return;
    }

    prepared.push({
      rowNumber,
      value: parsed.value,
      raw: parsed.raw,
      fingerprint: jobFingerprint({
        company: parsed.value.company,
        title: parsed.value.title,
        location: parsed.value.location,
      }),
    });
  });

  // --- 2. Dedupe within the file -------------------------------------------
  const seen = new Map<string, number>();
  const unique: Prepared[] = [];

  for (const row of prepared) {
    const key = row.value.source_job_id
      ? `id:${row.value.source}:${row.value.source_job_id}`
      : `fp:${row.fingerprint}`;

    const firstSeenAt = seen.get(key);
    if (firstSeenAt !== undefined) {
      outcomes.push({
        rowNumber: row.rowNumber,
        status: "duplicate",
        title: row.value.title,
        company: row.value.company,
        reason: `duplicate of row ${firstSeenAt} in this file`,
      });
      continue;
    }
    seen.set(key, row.rowNumber);
    unique.push(row);
  }

  if (unique.length === 0) {
    return summarise(records.length, outcomes);
  }

  // --- 3. Dedupe against the database --------------------------------------
  const withSourceId = unique.filter((r) => r.value.source_job_id);
  const existing = await db
    .select({
      id: rawJobs.id,
      fingerprint: rawJobs.fingerprint,
      source: rawJobs.source,
      sourceJobId: rawJobs.sourceJobId,
    })
    .from(rawJobs)
    .where(
      or(
        inArray(
          rawJobs.fingerprint,
          unique.map((r) => r.fingerprint),
        ),
        ...(withSourceId.length > 0
          ? [
              or(
                ...withSourceId.map((r) =>
                  and(
                    eq(rawJobs.source, r.value.source),
                    eq(rawJobs.sourceJobId, r.value.source_job_id!),
                  ),
                ),
              )!,
            ]
          : []),
      ),
    );

  const existingFingerprints = new Set(existing.map((r) => r.fingerprint));
  const existingSourceIds = new Set(
    existing
      .filter((r) => r.sourceJobId)
      .map((r) => `${r.source}:${r.sourceJobId}`),
  );

  const fresh: Prepared[] = [];
  const duplicateIds: string[] = [];

  for (const row of unique) {
    const bySourceId =
      row.value.source_job_id &&
      existingSourceIds.has(`${row.value.source}:${row.value.source_job_id}`);
    const byFingerprint = existingFingerprints.has(row.fingerprint);

    if (bySourceId || byFingerprint) {
      const match = existing.find((e) =>
        bySourceId
          ? e.source === row.value.source &&
            e.sourceJobId === row.value.source_job_id
          : e.fingerprint === row.fingerprint,
      );
      if (match) duplicateIds.push(match.id);
      outcomes.push({
        rowNumber: row.rowNumber,
        status: "duplicate",
        title: row.value.title,
        company: row.value.company,
        reason: bySourceId
          ? "already ingested (same source job id)"
          : "already ingested (same company, title and location)",
      });
      continue;
    }
    fresh.push(row);
  }

  // --- 4. Persist ----------------------------------------------------------
  if (duplicateIds.length > 0) {
    // Seeing a job again is evidence the listing is still live (JSV2S1041).
    await db
      .update(rawJobs)
      .set({ lastSeenAt: sql`now()`, updatedAt: sql`now()` })
      .where(inArray(rawJobs.id, duplicateIds));
  }

  // --- 5. Pre-qualify (JSV2S1038) ------------------------------------------
  //
  // Runs before persistence so the verdict is stored with the job on its only
  // insert. Deterministic, offline and free — the whole point is to decide this
  // without spending anything.
  const verdicts = new Map<string, PreQualificationResult>();
  for (const row of fresh) {
    verdicts.set(
      row.fingerprint,
      prequalify({
        title: row.value.title,
        company: row.value.company,
        location: row.value.location ?? null,
        country: row.value.country ?? null,
        description: row.value.description ?? null,
      }),
    );
  }

  /** Does this job get an application? Only a gating trigger withholds one. */
  const qualifies = (fingerprint: string) =>
    !gating || verdicts.get(fingerprint)?.decision === "pass";

  // --- 6. Persist ----------------------------------------------------------
  if (fresh.length > 0) {
    const created = await db.transaction(async (tx) => {
      const jobRows: NewRawJob[] = fresh.map((row) => {
        const verdict = verdicts.get(row.fingerprint)!;
        return {
          source: row.value.source,
          sourceJobId: row.value.source_job_id ?? null,
          title: row.value.title,
          company: row.value.company,
          location: row.value.location ?? null,
          country: row.value.country ?? null,
          description: row.value.description ?? null,
          jobUrl: row.value.job_url,
          externalApplyUrl: row.value.external_apply_url ?? null,
          postedAt: row.value.posted_at ?? null,
          employmentType: row.value.employment_type ?? null,
          seniority: row.value.seniority ?? null,
          salaryRaw: row.value.salary_raw ?? null,
          visaSponsorshipMentioned: row.value.visa_sponsorship_mentioned ?? null,
          ingestionMethod: trigger === "manual_upload" ? "manual_upload" : "api",
          inboundSourceDetail: row.value.inbound_source_detail ?? null,
          reachability: row.value.reachability ?? null,
          notes: row.value.notes ?? null,
          rawPayload: row.raw,
          fingerprint: row.fingerprint,
          // JSV2S1040 — the comparison basis for Updated vs Reposted on a later
          // sighting. Job *identity* stays in `fingerprint`, which must not move
          // when a posting is edited; this hash is meant to.
          contentHash: contentHash({
            title: row.value.title,
            company: row.value.company,
            location: row.value.location ?? null,
            description: row.value.description ?? null,
            salaryRaw: row.value.salary_raw ?? null,
            employmentType: row.value.employment_type ?? null,
            seniority: row.value.seniority ?? null,
          }),
          prequalification: verdict.decision,
          prequalificationDetail: verdict,
          prequalifiedAt: new Date(verdict.evaluatedAt),
          prequalificationVersion: verdict.configVersion,
        };
      });

      const insertedJobs = await tx
        .insert(rawJobs)
        .values(jobRows)
        .returning({ id: rawJobs.id, fingerprint: rawJobs.fingerprint });

      const jobIdByFingerprint = new Map(
        insertedJobs.map((j) => [j.fingerprint, j.id]),
      );

      // D1, amended by ADR-0006: a job becomes an application only if it
      // qualifies. A screened-out job keeps its raw_jobs row and waits in the
      // review queue instead of being lost.
      const qualifying = fresh.filter((row) => qualifies(row.fingerprint));

      const appIdByJobId = new Map<string, string>();
      if (qualifying.length > 0) {
        const insertedApps = await tx
          .insert(applications)
          .values(
            qualifying.map((row) => ({
              rawJobId: jobIdByFingerprint.get(row.fingerprint)!,
              status: "ready_to_apply" as const,
            })),
          )
          .returning({ id: applications.id, rawJobId: applications.rawJobId });

        for (const app of insertedApps) appIdByJobId.set(app.rawJobId, app.id);
      }

      // Only qualifying rows have an application to hang an event on. Mapping
      // over all of `fresh` here would insert `applicationId: undefined`.
      const events: NewApplicationEvent[] = qualifying.map((row) => {
        const jobId = jobIdByFingerprint.get(row.fingerprint)!;
        return {
          applicationId: appIdByJobId.get(jobId)!,
          eventType: "application_created" as const,
          toStatus: "ready_to_apply" as const,
          summary: `Application created from ${trigger === "manual_upload" ? "manual upload" : trigger} — ${row.value.title} at ${row.value.company}`,
          metadata: {
            source: row.value.source,
            rowNumber: row.rowNumber,
            prequalification: verdicts.get(row.fingerprint)?.decision,
          },
        };
      });
      // An all-screened-out batch leaves this empty, and Drizzle throws on
      // `.values([])`.
      if (events.length > 0) await tx.insert(applicationEvents).values(events);

      return { jobIdByFingerprint, appIdByJobId };
    });

    for (const row of fresh) {
      const jobId = created.jobIdByFingerprint.get(row.fingerprint);
      const verdict = verdicts.get(row.fingerprint)!;
      const screened = !qualifies(row.fingerprint);

      outcomes.push({
        rowNumber: row.rowNumber,
        status: screened ? "screened_out" : "inserted",
        title: row.value.title,
        company: row.value.company,
        incomplete: isIncomplete(row.value),
        prequalification: verdict.decision,
        applicationId: jobId ? created.appIdByJobId.get(jobId) : undefined,
        reason: screened
          ? verdict.reason
          : isIncomplete(row.value)
            ? "imported without a usable job description — scoring and tailoring are disabled until it is added"
            : undefined,
      });
    }
  }

  return summarise(records.length, outcomes);
}

function summarise(total: number, rows: RowOutcome[]): IngestResult {
  rows.sort((a, b) => a.rowNumber - b.rowNumber);
  return {
    total,
    inserted: rows.filter((r) => r.status === "inserted").length,
    screenedOut: rows.filter((r) => r.status === "screened_out").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    incomplete: rows.filter((r) => r.incomplete).length,
    rows,
  };
}
