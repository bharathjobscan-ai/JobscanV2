import type { JobSource } from "@/lib/config/constants";
import type { UploadRow } from "../schema";

/**
 * JSV2S1001 — the contract every job source implements.
 *
 * Deliberately thin. The backlog also specified a registry, `sources.yaml`,
 * `mapping.yaml` and a parser-override mechanism (JSV2S1002–1005); those were
 * cut from Phase 1.5 because configuration-driven mapping for a *single* source
 * is machinery without a second case to justify it. This interface is the seam
 * that keeps them cheap to add later — the same role `AiProvider` played when
 * ADR-0005 swapped the entire AI execution model without touching its callers.
 *
 * An adapter's only job is **fetch and map**. It does not validate, dedupe or
 * persist: those already exist in `ingest.ts` and work identically for every
 * source, and duplicating them per adapter is how sources drift apart.
 */

/** What an adapter is asked to go and get. Source-specific keys live in `raw`. */
export type FetchParams = {
  /** Search terms. Interpretation is the adapter's business. */
  keywords?: string[];
  locations?: string[];
  /** Only return postings newer than this many days, where supported. */
  postedWithinDays?: number;
  /**
   * Hard ceiling on results.
   *
   * This is a cost control, not a convenience: every job returned is a
   * candidate for a billed scoring call downstream. An adapter must honour it.
   */
  limit: number;
  /**
   * Titles to drop outright, where the source can filter on them.
   *
   * Applied at the source rather than after ingestion because a paid source
   * bills per result returned — a record filtered here is one we never buy.
   */
  titleExclude?: string[];
  /**
   * Source-native job ids already stored, for sources that can skip them.
   *
   * Distinct from the dedupe in `ingest.ts`, which runs *after* the records
   * have been paid for. This is the only dedupe that saves money.
   */
  skipJobIds?: string[];
  /** Escape hatch for parameters only one source understands. */
  raw?: Record<string, unknown>;
};

export type FetchedJob = {
  /**
   * The source's own stable id, when it has one. Feeds the first tier of the
   * identity hierarchy (JSV2S1039); without it dedupe falls back to the
   * content fingerprint.
   */
  sourceJobId?: string | null;
  /** Mapped onto the canonical shape that `parseUploadRow` already validates. */
  row: Partial<UploadRow> & Record<string, unknown>;
  /** The provider's response for this job, verbatim, for reprocessing. */
  rawPayload: unknown;
};

export type FetchResult = {
  jobs: FetchedJob[];
  /**
   * Records the adapter could not map. They are preserved to the DLQ
   * (JSV2S1015) rather than thrown, so one malformed record cannot cost the
   * whole run (JSV2S1013).
   */
  failures: { payload: unknown; error: string }[];
  /** Anything worth putting on the run's log — page counts, truncation. */
  notes?: Record<string, unknown>;
  /**
   * What this fetch cost, in USD (JSV2S1144).
   *
   * Reported by the adapter rather than computed by the caller, because only
   * the adapter knows its source's pricing model — Apify bills per result plus
   * a start event; another source might bill per request, or nothing. Omitted
   * means free, which is the honest reading for a source with no cost.
   */
  costUsd?: number;
};

export interface JobSourceAdapter {
  readonly source: JobSource;
  /** Human-readable, for logs and the run listing. */
  readonly label: string;
  /**
   * Whether the adapter has what it needs to run — API keys, actor ids.
   * Checked before a scheduled run so a missing secret is a clear skip rather
   * than a stack trace at 3am.
   */
  isConfigured(): boolean;
  fetch(params: FetchParams): Promise<FetchResult>;
}
