import { mapDataset, type ApifyLinkedInJob } from "./sources/apify-linkedin";

/**
 * Recognise what shape an uploaded file is in (JSV2S1035).
 *
 * The upload template is one shape; an Apify export is another, and pasting one
 * into the other's parser rejects every row — the actor gives no `source`
 * column at all, and its `id` and `experienceLevel` do not alias onto anything.
 *
 * Rather than bolt twenty more header aliases on, an Apify-shaped file is
 * routed through the **same mapper the live adapter uses**. That matters more
 * than convenience: a bulk backfill and a nightly fetch then produce byte-
 * identical rows, so a job ingested either way dedupes against itself and
 * carries the same description handling.
 */

export type UploadShape = "template" | "apify_linkedin";

/**
 * Signature columns.
 *
 * `descriptionHtml` and `applyType` are distinctive to the actor; `companyName`
 * alone is not, since a hand-made sheet might use it. Two of three is enough to
 * be sure without demanding a column the export might omit.
 */
export function detectShape(records: readonly Record<string, unknown>[]): UploadShape {
  const first = records[0];
  if (!first) return "template";

  const keys = new Set(Object.keys(first).map((k) => k.trim()));
  const markers = ["descriptionHtml", "applyType", "companyName", "postedTimeAgo"];
  const hits = markers.filter((m) => keys.has(m)).length;

  // A template file has `source` and `job_url`; the actor has neither.
  const looksLikeTemplate = keys.has("source") || keys.has("job_url");

  return hits >= 2 && !looksLikeTemplate ? "apify_linkedin" : "template";
}

export type NormalisedUpload = {
  shape: UploadShape;
  records: Record<string, unknown>[];
  /** Records the mapper could not use, preserved for the DLQ (JSV2S1015). */
  failures: { payload: unknown; error: string }[];
};

/**
 * Bring any recognised upload into the canonical row shape.
 *
 * The template passes through untouched — it is already canonical, and running
 * it through a mapper would only add a place for it to break.
 */
export function normaliseUpload(
  records: readonly Record<string, unknown>[],
): NormalisedUpload {
  const shape = detectShape(records);

  if (shape === "template") {
    return { shape, records: [...records], failures: [] };
  }

  const { jobs, failures } = mapDataset(records as ApifyLinkedInJob[]);
  return {
    shape,
    records: jobs.map((job) => job.row as Record<string, unknown>),
    failures,
  };
}
