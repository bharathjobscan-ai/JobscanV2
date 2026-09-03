import { describe, expect, it } from "vitest";

import {
  classifyObservation,
  contentHash,
  type IncomingObservation,
} from "@/features/ingestion/lifecycle";

const NOW = new Date("2026-09-03T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const job: IncomingObservation = {
  title: "Senior Product Manager",
  company: "Wise",
  location: "London",
  description: "Own the payments platform.",
};

describe("contentHash", () => {
  it("ignores case and whitespace differences", () => {
    expect(contentHash({ title: "Senior  PM", company: "Wise" })).toBe(
      contentHash({ title: "senior pm", company: "wise" }),
    );
  });

  it("changes when substantive content changes", () => {
    expect(contentHash(job)).not.toBe(
      contentHash({ ...job, description: "Own the lending platform." }),
    );
  });

  /**
   * Boards routinely re-issue the same posting under a new URL. Hashing the URL
   * would report every job as Updated on every run.
   */
  it("is unaffected by fields outside the content set", () => {
    const withExtra = { ...job, jobUrl: "https://example.com/2" } as IncomingObservation;
    expect(contentHash(withExtra)).toBe(contentHash(job));
  });
});

describe("classifyObservation", () => {
  it("calls an unseen job new", () => {
    expect(classifyObservation(null, job, { now: NOW })).toBe("new");
  });

  it("calls an unchanged, recently seen job a duplicate", () => {
    const stored = {
      contentHash: contentHash(job),
      lastSeenAt: daysAgo(1),
      postedAt: "2026-08-20",
    };
    expect(classifyObservation(stored, { ...job, postedAt: "2026-08-20" }, { now: NOW }))
      .toBe("duplicate");
  });

  it("calls a changed posting updated", () => {
    const stored = {
      contentHash: contentHash(job),
      lastSeenAt: daysAgo(1),
      postedAt: "2026-08-20",
    };
    const changed = { ...job, description: "Now owns lending too.", postedAt: "2026-08-20" };
    expect(classifyObservation(stored, changed, { now: NOW })).toBe("updated");
  });

  /**
   * A repost is usually byte-identical, so content comparison alone would call
   * it a duplicate. A posting date that moved forward is the employer saying
   * otherwise, and it has to outrank the hash.
   */
  it("calls a job with a newer posting date reposted, even when identical", () => {
    const stored = {
      contentHash: contentHash(job),
      lastSeenAt: daysAgo(1),
      postedAt: "2026-08-01",
    };
    expect(
      classifyObservation(stored, { ...job, postedAt: "2026-09-01" }, { now: NOW }),
    ).toBe("reposted");
  });

  it("calls a job reappearing after a long silence reposted, with no dates", () => {
    const stored = { contentHash: contentHash(job), lastSeenAt: daysAgo(40) };
    expect(classifyObservation(stored, job, { now: NOW })).toBe("reposted");
  });

  it("respects a custom repost gap", () => {
    const stored = { contentHash: contentHash(job), lastSeenAt: daysAgo(10) };
    expect(classifyObservation(stored, job, { now: NOW, repostGapDays: 7 })).toBe(
      "reposted",
    );
    expect(classifyObservation(stored, job, { now: NOW, repostGapDays: 30 })).toBe(
      "duplicate",
    );
  });

  it("prefers updated over reposted when content changed within the gap", () => {
    const stored = { contentHash: contentHash(job), lastSeenAt: daysAgo(2) };
    expect(
      classifyObservation(stored, { ...job, title: "Lead PM" }, { now: NOW }),
    ).toBe("updated");
  });

  it("does not call an older posting date a repost", () => {
    const stored = {
      contentHash: contentHash(job),
      lastSeenAt: daysAgo(1),
      postedAt: "2026-09-01",
    };
    expect(
      classifyObservation(stored, { ...job, postedAt: "2026-08-01" }, { now: NOW }),
    ).toBe("duplicate");
  });
});
