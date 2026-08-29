import { and, eq, inArray, or, sql } from "drizzle-orm";

import {
  applicationEvents,
  applications,
  rawJobs,
  type NewApplicationEvent,
  type NewRawJob,
} from "@/db/schema";
import { db } from "@/lib/db/client";
import { jobFingerprint } from "./fingerprint";
import { isIncomplete, parseUploadRow, type UploadRow } from "./schema";

export type RowOutcome = {
  rowNumber: number;
  status: "inserted" | "duplicate" | "rejected";
  title?: string;
  company?: string;
  /** Why it was rejected, or which rule matched for a duplicate. */
  reason?: string;
  incomplete?: boolean;
  applicationId?: string;
};

export type IngestResult = {
  total: number;
  inserted: number;
  duplicate: number;
  rejected: number;
  incomplete: number;
  rows: RowOutcome[];
};

type Prepared = {
  rowNumber: number;
  value: UploadRow;
  raw: Record<string, unknown>;
  fingerprint: string;
};

/**
 * Run an upload through the pipeline: validate → dedupe → persist → auto-create
 * applications.
 *
 * D1: uploads in Phase 1 are pre-filtered outside the system, so every newly
 * inserted job immediately becomes an application at `ready_to_apply`.
 *
 * A malformed row never aborts the batch (JSV2S1033).
 */
export async function ingestRows(
  records: Record<string, unknown>[],
): Promise<IngestResult> {
  const outcomes: RowOutcome[] = [];
  const prepared: Prepared[] = [];

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

  if (fresh.length > 0) {
    const created = await db.transaction(async (tx) => {
      const jobRows: NewRawJob[] = fresh.map((row) => ({
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
        ingestionMethod: "manual_upload",
        inboundSourceDetail: row.value.inbound_source_detail ?? null,
        reachability: row.value.reachability ?? null,
        notes: row.value.notes ?? null,
        rawPayload: row.raw,
        fingerprint: row.fingerprint,
      }));

      const insertedJobs = await tx
        .insert(rawJobs)
        .values(jobRows)
        .returning({ id: rawJobs.id, fingerprint: rawJobs.fingerprint });

      const jobIdByFingerprint = new Map(
        insertedJobs.map((j) => [j.fingerprint, j.id]),
      );

      // D1 — every uploaded job becomes an application immediately.
      const insertedApps = await tx
        .insert(applications)
        .values(
          insertedJobs.map((job) => ({
            rawJobId: job.id,
            status: "ready_to_apply" as const,
          })),
        )
        .returning({ id: applications.id, rawJobId: applications.rawJobId });

      const appIdByJobId = new Map(insertedApps.map((a) => [a.rawJobId, a.id]));

      const events: NewApplicationEvent[] = fresh.map((row) => {
        const jobId = jobIdByFingerprint.get(row.fingerprint)!;
        return {
          applicationId: appIdByJobId.get(jobId)!,
          eventType: "application_created" as const,
          toStatus: "ready_to_apply" as const,
          summary: `Application created from manual upload — ${row.value.title} at ${row.value.company}`,
          metadata: { source: row.value.source, rowNumber: row.rowNumber },
        };
      });
      await tx.insert(applicationEvents).values(events);

      return { jobIdByFingerprint, appIdByJobId };
    });

    for (const row of fresh) {
      const jobId = created.jobIdByFingerprint.get(row.fingerprint);
      outcomes.push({
        rowNumber: row.rowNumber,
        status: "inserted",
        title: row.value.title,
        company: row.value.company,
        incomplete: isIncomplete(row.value),
        applicationId: jobId ? created.appIdByJobId.get(jobId) : undefined,
        reason: isIncomplete(row.value)
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
    duplicate: rows.filter((r) => r.status === "duplicate").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    incomplete: rows.filter((r) => r.incomplete).length,
    rows,
  };
}
