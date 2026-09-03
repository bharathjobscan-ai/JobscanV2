/**
 * Phase 1 verification against a real database.
 *
 * Automates the README checklist (steps 2-7). Requires .env.local with working
 * Supabase credentials, which is why it is excluded from `npm test` and run via
 * `npm run test:integration`.
 *
 * Cleanup is scoped to fictional companies on a reserved URL host, so it cannot
 * touch a real application. That was NOT true before 2026-09-04: the fixture
 * used real employer names and the suite deleted a live Wise application.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.loadEnvFile(".env.local");
process.env.AI_PROVIDER = "mock";

const { and, eq, inArray, like, sql } = await import("drizzle-orm");
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

/**
 * Fixture companies are deliberately fictional and suffixed "QA".
 *
 * They used to be real fintech names — Revolut, Adyen, Stripe, Wise, Klarna,
 * Monzo, Airwallex, Checkout.com, Mollie — which are exactly the companies this
 * user applies to. `cleanup()` deletes by company name and the delete cascades
 * through applications, events, attempts and documents, so running the suite
 * destroyed a real scored Wise application on 2026-09-04. The comment above
 * claimed the cleanup was scoped and safe; it was scoped to names that collide.
 *
 * Nothing here may ever be a real employer.
 */
const FIXTURE_COMPANIES = [
  "Northgate Payments QA",
  "Vandermeer Acquiring QA",
  "Larkspur Billing QA",
  "Fernwood Transfers QA",
  "Ashgrove Checkout QA",
  "Bellhaven Treasury QA",
  "Calderwood Bank QA",
  "Deepwater Cards QA",
  "Ravensbourne Pay QA",
];

/** Second safety net: every fixture URL is on a reserved, unroutable host. */
const FIXTURE_URL_PREFIX = "https://fixture.jobscan.invalid/";

async function cleanup() {
  await db
    .delete(rawJobs)
    .where(
      and(
        inArray(rawJobs.company, FIXTURE_COMPANIES),
        like(rawJobs.jobUrl, `${FIXTURE_URL_PREFIX}%`),
      ),
    );
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
    const [noDescription] = await db
      .select()
      .from(rawJobs)
      .where(eq(rawJobs.company, "Calderwood Bank QA"))
      .limit(1);
    expect(noDescription).toBeDefined();
    expect(noDescription.description).toBeNull();

    const items = await listApplications("all");
    const item = items.find((i) => i.company === "Calderwood Bank QA");
    expect(item?.isIncomplete).toBe(true);
    expect(item?.nextAction).toBe("Add job description");
  });

  /**
   * D1, as amended by ADR-0006 and again on 2026-09-04.
   *
   * Every trigger gates now, uploads included — a bulk Apify backfill is a
   * manual upload too, and exempting it would create thousands of unwanted
   * applications. The fixture jobs are all genuine payments roles and all
   * qualify, so the one-application-per-job count still holds; the gated case
   * is proved by the screened-out test below.
   */
  it("creates one application per qualifying uploaded job (D1)", async () => {
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

    // The count above is only meaningful if the gate actually let them through.
    const [passed] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(rawJobs)
      .where(
        and(
          inArray(rawJobs.company, FIXTURE_COMPANIES),
          eq(rawJobs.prequalification, "pass"),
        ),
      );
    expect(passed.n).toBe(7);

    const statuses = await db
      .select({ status: applications.status })
      .from(applications)
      .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
      .where(inArray(rawJobs.company, FIXTURE_COMPANIES));
    expect(statuses.every((s) => s.status === "ready_to_apply")).toBe(true);
  });

  it("records a pre-qualification verdict on every ingested job", async () => {
    const rows = await db
      .select({
        decision: rawJobs.prequalification,
        version: rawJobs.prequalificationVersion,
        contentHash: rawJobs.contentHash,
      })
      .from(rawJobs)
      .where(inArray(rawJobs.company, FIXTURE_COMPANIES));

    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.decision !== null)).toBe(true);
    // The config fingerprint is what makes a rules change re-runnable.
    expect(rows.every((r) => r.version !== null)).toBe(true);
    // JSV2S1040 — the comparison basis for Updated vs Reposted.
    expect(rows.every((r) => r.contentHash !== null)).toBe(true);
  });

  /**
   * The behaviour the gate exists for: on a scheduled run, a job that does not
   * pre-qualify keeps its raw_jobs row and gets no application, so it never
   * reaches a billed scoring call.
   */
  it("withholds an application from a screened-out job", async () => {
    const company = `ZZ Prequal Gate ${Date.now()}`;
    const result = await ingestRows(
      [
        {
          title: "Senior Program Manager, Payments",
          company,
          source: "linkedin",
          job_url: `${FIXTURE_URL_PREFIX}gate-reject-${Date.now()}`,
          location: "London, United Kingdom",
          description:
            "Responsibilities\nOwn payment orchestration and settlement.\n\nRequirements\n7-10 years of experience.",
        },
        {
          title: "Senior Product Manager, Payments",
          company,
          source: "linkedin",
          job_url: `${FIXTURE_URL_PREFIX}gate-pass-${Date.now()}`,
          location: "London, United Kingdom",
          description:
            "Responsibilities\nOwn payment orchestration and settlement.\n\nRequirements\n7-10 years of experience.",
        },
      ],
      { trigger: "scheduled" },
    );

    expect(result.screenedOut).toBe(1);
    expect(result.inserted).toBe(1);

    const jobs = await db
      .select({ id: rawJobs.id, decision: rawJobs.prequalification })
      .from(rawJobs)
      .where(eq(rawJobs.company, company));
    expect(jobs).toHaveLength(2);

    const apps = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(applications)
      .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
      .where(eq(rawJobs.company, company));

    // Both jobs stored; only the qualifying one became an application.
    expect(apps[0].n).toBe(1);

    await db.delete(rawJobs).where(eq(rawJobs.company, company));
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
      .where(eq(rawJobs.company, "Larkspur Billing QA"))
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
      .where(eq(rawJobs.company, "Ashgrove Checkout QA"))
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
      .where(eq(rawJobs.company, "Northgate Payments QA"))
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
      .where(eq(rawJobs.company, "Fernwood Transfers QA"))
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
      .where(eq(rawJobs.company, "Calderwood Bank QA"))
      .limit(1);

    await expect(enqueueTask(target.id, "score")).rejects.toThrow(/description/i);
  });

  it("produces a score, documents and timeline events", async () => {
    const [target] = await db
      .select({ id: applications.id })
      .from(applications)
      .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
      .where(eq(rawJobs.company, "Vandermeer Acquiring QA"))
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
      .where(eq(rawJobs.company, "Vandermeer Acquiring QA"))
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
      .where(eq(rawJobs.company, "Bellhaven Treasury QA"))
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
