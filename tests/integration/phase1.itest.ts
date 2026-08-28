/**
 * Phase 1 verification against a real database.
 *
 * Automates the README checklist (steps 2-7). Requires .env.local with working
 * Supabase credentials, which is why it is excluded from `npm test` and run via
 * `npm run test:integration`.
 *
 * Scoped cleanup: only rows for the fixture companies are removed, so this is
 * safe to run against a database that already holds real applications.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.loadEnvFile(".env.local");
process.env.AI_PROVIDER = "mock";

const { and, eq, inArray, sql } = await import("drizzle-orm");
const { db } = await import("@/lib/db/client");
const { applicationAttempts, applicationDocuments, applicationEvents, applications, rawJobs } =
  await import("@/db/schema");
const { parseUploadFile } = await import("@/features/ingestion/parsers");
const { ingestRows } = await import("@/features/ingestion/ingest");
const { listApplications, countByView, getApplicationDetail } = await import(
  "@/features/applications/queries"
);
const { changeStatus, createAttempt } = await import("@/features/applications/mutations");
const { enqueueTask } = await import("@/features/ai/tasks");

const FIXTURE_COMPANIES = [
  "Revolut",
  "Adyen",
  "Stripe",
  "Wise",
  "Klarna",
  "Airwallex",
  "Monzo",
  "Checkout.com",
  "Mollie",
];

async function cleanup() {
  await db.delete(rawJobs).where(inArray(rawJobs.company, FIXTURE_COMPANIES));
}

async function loadFixture() {
  const buffer = readFileSync("tests/fixtures/sample-jobs.csv");
  return parseUploadFile(buffer, "sample-jobs.csv");
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
});

describe("step 2 — upload", () => {
  it("inserts 7, rejects 2, detects 1 duplicate", async () => {
    const rows = await loadFixture();
    expect(rows).toHaveLength(10);

    const result = await ingestRows(rows);

    expect({
      inserted: result.inserted,
      duplicate: result.duplicate,
      rejected: result.rejected,
    }).toEqual({ inserted: 7, duplicate: 1, rejected: 2 });
  });

  it("gives a reason for every rejected row", async () => {
    const result = await ingestRows(await loadFixture());
    for (const row of result.rows.filter((r) => r.status === "rejected")) {
      expect(row.reason, `row ${row.rowNumber}`).toBeTruthy();
    }
  });

  it("flags the row with no job description as incomplete", async () => {
    const [monzo] = await db
      .select()
      .from(rawJobs)
      .where(eq(rawJobs.company, "Monzo"))
      .limit(1);
    expect(monzo).toBeDefined();
    expect(monzo.description).toBeNull();

    const items = await listApplications("all");
    const item = items.find((i) => i.company === "Monzo");
    expect(item?.isIncomplete).toBe(true);
    expect(item?.nextAction).toBe("Add job description");
  });

  it("auto-creates one application per job at ready_to_apply (D1)", async () => {
    const [jobs] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(rawJobs)
      .where(inArray(rawJobs.company, FIXTURE_COMPANIES));

    const [apps] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(applications)
      .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
      .where(inArray(rawJobs.company, FIXTURE_COMPANIES));

    expect(jobs.n).toBe(7);
    expect(apps.n).toBe(jobs.n);

    const statuses = await db
      .select({ status: applications.status })
      .from(applications)
      .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
      .where(inArray(rawJobs.company, FIXTURE_COMPANIES));
    expect(statuses.every((s) => s.status === "ready_to_apply")).toBe(true);
  });

  it("writes an application_created event per application", async () => {
    const events = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(applicationEvents)
      .where(eq(applicationEvents.eventType, "application_created"));
    expect(events[0].n).toBeGreaterThanOrEqual(7);
  });
});

describe("step 3 — idempotency", () => {
  it("re-uploading the same file inserts nothing", async () => {
    const result = await ingestRows(await loadFixture());
    expect({ inserted: result.inserted, duplicate: result.duplicate }).toEqual({
      inserted: 0,
      duplicate: 8,
    });
  });

  it("advances last_seen_at instead of inserting", async () => {
    const [job] = await db
      .select()
      .from(rawJobs)
      .where(eq(rawJobs.company, "Stripe"))
      .limit(1);
    expect(job.lastSeenAt.getTime()).toBeGreaterThanOrEqual(job.firstSeenAt.getTime());
  });
});

describe("step 4 — views and derived pending (C2)", () => {
  it("view counts partition the total", async () => {
    const counts = await countByView();
    expect(counts.ready + counts.active + counts.pending + counts.closed).toBe(counts.all);
  });

  it("derives pending from applied_at without a stored status change", async () => {
    const [target] = await db
      .select({ id: applications.id })
      .from(applications)
      .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
      .where(eq(rawJobs.company, "Klarna"))
      .limit(1);

    await changeStatus(target.id, "applied");
    let items = await listApplications("pending");
    expect(items.find((i) => i.id === target.id)).toBeUndefined();

    // Back-date beyond DEEMED_PENDING_DAYS.
    await db
      .update(applications)
      .set({ appliedAt: sql`now() - interval '60 days'` })
      .where(eq(applications.id, target.id));

    items = await listApplications("pending");
    expect(items.find((i) => i.id === target.id)).toBeDefined();

    // Still stored as `applied` — the state is derived, never written.
    const [after] = await db
      .select({ status: applications.status })
      .from(applications)
      .where(eq(applications.id, target.id));
    expect(after.status).toBe("applied");

    // And it is excluded from Active, so the views stay disjoint.
    const active = await listApplications("active");
    expect(active.find((i) => i.id === target.id)).toBeUndefined();
  });
});

describe("step 5 — lifecycle", () => {
  it("records one event per transition and stamps the attempt outcome", async () => {
    const [target] = await db
      .select({ id: applications.id })
      .from(applications)
      .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
      .where(eq(rawJobs.company, "Revolut"))
      .limit(1);

    for (const status of ["applied", "shortlisted", "interview", "offer"] as const) {
      await changeStatus(target.id, status);
    }

    const detail = await getApplicationDetail(target.id);
    expect(detail!.status).toBe("offer");
    expect(detail!.closedAt).not.toBeNull();
    expect(detail!.appliedAt).not.toBeNull();

    const transitions = detail!.timeline.filter((e) => e.eventType === "status_changed");
    expect(transitions).toHaveLength(4);
    expect(transitions.map((t) => t.toStatus)).toEqual([
      "offer",
      "interview",
      "shortlisted",
      "applied",
    ]);

    // Moving to `applied` opened attempt 1 automatically.
    expect(detail!.attempts).toHaveLength(1);
    expect(detail!.attempts[0].outcome).toBe("offer");
  });
});

describe("step 6 — attempts (JSV2S1096)", () => {
  it("keeps attempts independent, each with its own email and outcome", async () => {
    const [target] = await db
      .select({ id: applications.id })
      .from(applications)
      .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
      .where(eq(rawJobs.company, "Wise"))
      .limit(1);

    await changeStatus(target.id, "applied");
    await changeStatus(target.id, "rejected_application");

    await createAttempt(target.id, {
      channel: "email",
      emailUsed: "second.address@example.com",
    });
    await changeStatus(target.id, "shortlisted");

    const detail = await getApplicationDetail(target.id);
    expect(detail!.attempts).toHaveLength(2);

    const [first, second] = detail!.attempts;
    expect(first.outcome).toBe("rejected_application");
    expect(second.emailUsed).toBe("second.address@example.com");
    expect(second.outcome).toBeNull(); // shortlisted is not terminal

    // A new attempt reopened the application.
    expect(detail!.status).toBe("shortlisted");
    expect(detail!.closedAt).toBeNull();
  });
});

describe("step 7 — AI generation on the mock provider", () => {
  it("blocks generation while the job description is missing", async () => {
    const [target] = await db
      .select({ id: applications.id })
      .from(applications)
      .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
      .where(eq(rawJobs.company, "Monzo"))
      .limit(1);

    await expect(enqueueTask(target.id, "score")).rejects.toThrow(/description/i);
  });

  it("produces a score, documents and timeline events", async () => {
    const [target] = await db
      .select({ id: applications.id })
      .from(applications)
      .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
      .where(eq(rawJobs.company, "Adyen"))
      .limit(1);

    await enqueueTask(target.id, "score");
    await enqueueTask(target.id, "tailor_cv");
    await enqueueTask(target.id, "cover_letter");

    const detail = await getApplicationDetail(target.id);

    expect(detail!.jobScore).toBeGreaterThanOrEqual(0);
    expect(detail!.jobScore).toBeLessThanOrEqual(100);
    expect(detail!.jobScoreAnalysis?.strengths?.length).toBeGreaterThan(0);
    expect(detail!.matchCategory).toBeTruthy();

    expect(Object.keys(detail!.latestDocuments).sort()).toEqual([
      "cover_letter",
      "resume",
      "score_report",
    ]);
    for (const doc of Object.values(detail!.latestDocuments)) {
      expect(doc.contentMd?.length ?? 0).toBeGreaterThan(20);
      expect(doc.generatedBy).toBe("mock");
    }

    const generated = detail!.timeline.filter((e) => e.eventType === "document_generated");
    expect(generated).toHaveLength(3);
  });

  it("versions a regenerated document rather than overwriting it", async () => {
    const [target] = await db
      .select({ id: applications.id })
      .from(applications)
      .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
      .where(eq(rawJobs.company, "Adyen"))
      .limit(1);

    await enqueueTask(target.id, "tailor_cv");

    const versions = await db
      .select({ version: applicationDocuments.version })
      .from(applicationDocuments)
      .where(
        and(
          eq(applicationDocuments.applicationId, target.id),
          eq(applicationDocuments.docType, "resume"),
        ),
      );
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);
  });
});

describe("referential integrity", () => {
  it("cascades deletes from raw_jobs through the whole graph", async () => {
    const [job] = await db
      .select({ id: rawJobs.id })
      .from(rawJobs)
      .where(eq(rawJobs.company, "Airwallex"))
      .limit(1);

    const [app] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.rawJobId, job.id));

    await changeStatus(app.id, "applied");
    await db.delete(rawJobs).where(eq(rawJobs.id, job.id));

    const leftovers = await Promise.all([
      db.select().from(applications).where(eq(applications.id, app.id)),
      db.select().from(applicationEvents).where(eq(applicationEvents.applicationId, app.id)),
      db.select().from(applicationAttempts).where(eq(applicationAttempts.applicationId, app.id)),
    ]);
    expect(leftovers.flat()).toHaveLength(0);
  });
});
