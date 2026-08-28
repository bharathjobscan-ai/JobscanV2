import { describe, expect, it } from "vitest";

import { parseTaskResponse } from "@/lib/ai/types";
import {
  ACTIVE_STATUSES,
  APPLICATION_STATUSES,
  CLOSED_STATUSES,
  isClosed,
  nextAction,
  STATUS_LABELS,
} from "@/lib/config/constants";

describe("application status model (D2)", () => {
  it("keeps the design-doc naming", () => {
    expect(APPLICATION_STATUSES).toContain("rejected_application");
    expect(APPLICATION_STATUSES).not.toContain("rejected_shortlist");
  });

  it("includes offer, so the funnel has a terminal success state", () => {
    expect(APPLICATION_STATUSES).toContain("offer");
    expect(isClosed("offer")).toBe(true);
  });

  it("does not store deemed_pending — it is derived (C2)", () => {
    expect(APPLICATION_STATUSES).not.toContain("deemed_pending");
  });

  it("labels every status", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("partitions active and closed without overlap", () => {
    const overlap = ACTIVE_STATUSES.filter((s) => CLOSED_STATUSES.includes(s));
    expect(overlap).toEqual([]);
  });

  it("covers every status with ready_to_apply, active or closed", () => {
    const covered = new Set([...ACTIVE_STATUSES, ...CLOSED_STATUSES, "ready_to_apply"]);
    expect(APPLICATION_STATUSES.filter((s) => !covered.has(s))).toEqual([]);
  });
});

describe("nextAction", () => {
  const base = {
    status: "ready_to_apply" as const,
    referralStatus: "not_needed" as const,
    hasResume: false,
    hasScore: true,
    isIncomplete: false,
  };

  it("puts a missing description ahead of everything else", () => {
    expect(nextAction({ ...base, isIncomplete: true, hasScore: false })).toBe(
      "Add job description",
    );
  });

  it("asks for a score before anything can be judged", () => {
    expect(nextAction({ ...base, hasScore: false })).toBe("Generate job score");
  });

  it("prioritises a needed referral over generating the resume", () => {
    expect(nextAction({ ...base, referralStatus: "needed" })).toBe("Request referral");
  });

  it("asks for the resume once the referral is settled", () => {
    expect(nextAction(base)).toBe("Generate resume");
  });

  it("moves to applying once material exists", () => {
    expect(nextAction({ ...base, hasResume: true })).toBe("Review and apply");
  });

  it("waits after applying", () => {
    expect(nextAction({ ...base, status: "applied", hasResume: true })).toBe(
      "Await response",
    );
  });
});

describe("parseTaskResponse", () => {
  it("splits a JSON block from the markdown body", () => {
    const { payload, markdown } = parseTaskResponse(
      '```json\n{"score": 88, "matchCategory": "perfect_match"}\n```\n\n# Report\n\nBody text.',
    );
    expect(payload.score).toBe(88);
    expect(payload.matchCategory).toBe("perfect_match");
    expect(markdown).toContain("# Report");
    expect(markdown).not.toContain("```json");
  });

  it("clamps a score to 0-100", () => {
    expect(parseTaskResponse('```json\n{"score": 140}\n```\nx').payload.score).toBe(100);
    expect(parseTaskResponse('```json\n{"score": -5}\n```\nx').payload.score).toBe(0);
  });

  it("keeps the document when there is no JSON block", () => {
    const { payload, markdown } = parseTaskResponse("# Just markdown\n\nText.");
    expect(payload).toEqual({});
    expect(markdown).toContain("Just markdown");
  });

  it("keeps the document when the JSON block is malformed", () => {
    const { payload, markdown } = parseTaskResponse(
      "```json\n{ broken\n```\n\n# Still useful",
    );
    expect(payload).toEqual({});
    expect(markdown).toContain("Still useful");
  });
});
