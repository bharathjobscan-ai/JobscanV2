import { describe, expect, it } from "vitest";

import { trimScoreReport } from "@/features/scoring/report";

/** Shape taken from a real stored report (Thought Machine, 2026-09-22). */
const REPORT = `SCORE: 70/100 — APPLY

### 3. Key Insights
- **Top 3 strengths for this role:**
  - **Domain:** payments.
- **Visa assessment:** Moderate confidence.

### 4. Application Strategy
- **Recommended approach:** Apply immediately.

### 5. Next Actions
- Run CV Optimizer for this JD.

### 6. Web Search Evidence
- **Entity Resolved:** Thought Machine, Unipessoal Lda.`;

describe("trimScoreReport", () => {
  it("keeps insights and search evidence, drops strategy and next actions", () => {
    const out = trimScoreReport(REPORT);
    expect(out).toContain("Key Insights");
    expect(out).toContain("Web Search Evidence");
    expect(out).toContain("Entity Resolved");
    expect(out).not.toContain("Application Strategy");
    expect(out).not.toContain("Next Actions");
    expect(out).not.toContain("Run CV Optimizer");
  });

  it("drops the decision line the page already shows", () => {
    expect(trimScoreReport(REPORT)).not.toMatch(/SCORE:\s*70/);
    expect(trimScoreReport("### SCORE: 77/100 — APPLY\n\n### Key Insights\n- a")).not.toMatch(
      /SCORE/,
    );
  });

  it("drops the prose copies of the header and breakdown", () => {
    const out = trimScoreReport(
      "### 1. Decision Header\nApply.\n\n### 2. Score Breakdown\n| a | b |\n\n### 3. Key Insights\n- kept",
    );
    expect(out).toBe("### Key Insights\n- kept");
  });

  it("drops a combined strategy-and-actions section", () => {
    const out = trimScoreReport(
      "### Web Search Evidence\n- kept\n\n### Application Strategy & Next Actions\n- gone",
    );
    expect(out).toBe("### Web Search Evidence\n- kept");
  });

  it("strips the leftover numbering so the kept sections do not read as gaps", () => {
    expect(trimScoreReport(REPORT)).toMatch(/^### Key Insights/m);
    expect(trimScoreReport(REPORT)).toMatch(/^### Web Search Evidence/m);
  });

  it("keeps nested bullets and their indentation", () => {
    expect(trimScoreReport(REPORT)).toContain("  - **Domain:** payments.");
  });
});
