import { createHash } from "node:crypto";

import type { JobLifecycleState } from "@/lib/config/constants";

/**
 * JSV2S1040 — classify an observed job as New, Duplicate, Updated or Reposted.
 *
 * Phase 1 could only tell New from Duplicate, because a single observation
 * carries no history. The other two need repeat observation, which is what
 * `first_seen_at` / `last_seen_at` (JSV2S1041) were captured for.
 *
 * The distinction that matters downstream: an **updated** posting is the same
 * opportunity with changed text, so an existing score may still hold. A
 * **repost** is the employer listing it afresh — the posting-age penalty in
 * ScoreG resets, and it is worth looking at again.
 */

/** Fields whose change means the posting itself changed, not just its metadata. */
export type ContentFields = {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  salaryRaw?: string | null;
  employmentType?: string | null;
  seniority?: string | null;
};

function normalise(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKD").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * A hash of the substantive content.
 *
 * Deliberately excludes URLs, ids and timestamps: boards routinely re-issue the
 * same posting under a new URL, and treating that as a change would report
 * every job as Updated on every run.
 */
export function contentHash(fields: ContentFields): string {
  const parts = [
    normalise(fields.title),
    normalise(fields.company),
    normalise(fields.location),
    normalise(fields.description),
    normalise(fields.salaryRaw),
    normalise(fields.employmentType),
    normalise(fields.seniority),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export type StoredObservation = {
  contentHash: string;
  postedAt?: string | Date | null;
  lastSeenAt: Date;
};

export type IncomingObservation = ContentFields & {
  postedAt?: string | Date | null;
};

export type ClassifyOptions = {
  /**
   * How long a job must be unseen before reappearing counts as a repost rather
   * than a duplicate. Defaults to 21 days.
   *
   * Deliberately NOT DEEMED_PENDING_DAYS: that governs employer silence on an
   * application, a different question that happens to be measured in days.
   * Coupling them would make one impossible to tune without moving the other.
   */
  repostGapDays?: number;
  now?: Date;
};

const DAY_MS = 86_400_000;

function toTime(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

export function classifyObservation(
  stored: StoredObservation | null,
  incoming: IncomingObservation,
  { repostGapDays = 21, now = new Date() }: ClassifyOptions = {},
): JobLifecycleState {
  if (!stored) return "new";

  const incomingPosted = toTime(incoming.postedAt);
  const storedPosted = toTime(stored.postedAt);

  // A posting date that has moved forward is the employer's own statement that
  // this is a fresh listing. It outranks content comparison: a repost is
  // usually byte-identical, so content alone would call it a duplicate.
  if (incomingPosted !== null && storedPosted !== null && incomingPosted > storedPosted) {
    return "reposted";
  }

  const changed = contentHash(incoming) !== stored.contentHash;

  // Reappearing after a long silence is a repost even when the board gave no
  // date, which many of them do not.
  const goneQuietFor = now.getTime() - stored.lastSeenAt.getTime();
  if (!changed && goneQuietFor >= repostGapDays * DAY_MS) return "reposted";

  return changed ? "updated" : "duplicate";
}
