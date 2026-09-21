import { describe, expect, it } from "vitest";

import { jobFingerprint } from "@/features/ingestion/fingerprint";

/**
 * The 2026-09-21 production failure, reduced to its cause.
 *
 * Berlin fetched 13 jobs and Dublin 8, and BOTH batches inserted zero. The
 * digest said "the fetch threw", which sent everyone to look at Apify — where
 * every actor run had finished successfully. The throw was ours, on the
 * `raw_jobs` insert.
 *
 * Two identity keys exist and the batch only deduped on one of them:
 *
 *   - `(source, source_job_id)` — unique index, when the id is present
 *   - `fingerprint`             — unique index, ALWAYS
 *
 * In-batch dedupe keyed on the source id *when present* and on the fingerprint
 * only otherwise. So two postings with DIFFERENT LinkedIn job ids and the SAME
 * company, title and location — a repost, or one role listed twice, which is
 * ordinary on LinkedIn — were both treated as fresh, both reached the insert,
 * and the second violated `raw_jobs_fingerprint_uq`.
 *
 * The insert is one statement for the whole batch, so one collision destroyed
 * twenty-one good jobs.
 */
describe("in-batch identity", () => {
  const repost = (sourceJobId: string) => ({
    source: "linkedin",
    source_job_id: sourceJobId,
    company: "Acme Payments QA",
    title: "Senior Product Manager, Payments",
    location: "Berlin, Germany",
  });

  it("gives two reposts of one role the same fingerprint", () => {
    const a = repost("4001");
    const b = repost("4002");
    expect(a.source_job_id).not.toBe(b.source_job_id);
    // Different postings by the source's own id, one job by ours.
    expect(jobFingerprint(a)).toBe(jobFingerprint(b));
  });

  /**
   * The key the batch must dedupe on. Keying by source id alone lets the pair
   * above through; the row must be rejected if EITHER key has been seen.
   */
  it("is only unique when both keys are unseen", () => {
    const seenIds = new Set<string>();
    const seenFingerprints = new Set<string>();

    const accept = (row: ReturnType<typeof repost>) => {
      const idKey = row.source_job_id ? `${row.source}:${row.source_job_id}` : null;
      const fp = jobFingerprint(row);
      if ((idKey && seenIds.has(idKey)) || seenFingerprints.has(fp)) return false;
      if (idKey) seenIds.add(idKey);
      seenFingerprints.add(fp);
      return true;
    };

    expect(accept(repost("4001"))).toBe(true);
    expect(accept(repost("4002"))).toBe(false);
  });
});
