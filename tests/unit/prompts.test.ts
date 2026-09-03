import { describe, expect, it } from "vitest";

import { buildPrompt } from "@/lib/ai/prompts";
import type { TaskContext } from "@/lib/ai/types";

const base: Omit<TaskContext, "taskType"> = {
  applicationId: "00000000-0000-0000-0000-000000000000",
  title: "Product Lead - Business Payments",
  company: "Wise",
  description: "A job description long enough to be usable.",
  jobUrl: "https://example.com/job",
};

describe("buildPrompt", () => {
  /**
   * Regression: a single shared output contract was appended to every task, so
   * the scoring run was told to emit `<<<CV>>>` and a cover letter as well.
   * Gemini complied, and a whole resume landed inside a score report.
   */
  it("never asks a scoring run for documents", async () => {
    const { system } = await buildPrompt({ ...base, taskType: "score" });

    expect(system).not.toContain("<<<CV>>>");
    expect(system).not.toContain("<<<COVER_LETTER>>>");
    // The CVG output-summary schema belongs to the document tasks only.
    expect(system).not.toContain("emailSubject");
    expect(system).toContain('"visaSignal"');
  });

  it("asks a document run for both documents and no score", async () => {
    const { system } = await buildPrompt({ ...base, taskType: "tailor_cv" });

    expect(system).toContain("<<<CV>>>");
    expect(system).toContain("<<<COVER_LETTER>>>");
    expect(system).toContain("emailSubject");
    expect(system).not.toContain('"visaSignal"');
  });
});
