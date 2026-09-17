import { describe, expect, it } from "vitest";

import { applyAccepted, project, validateRecommendations } from "@/features/simg/apply";
import type { SimgEvaluation, SimgRecommendation } from "@/features/simg/types";

const CV = `# Bharath Raghu
bharath@example.com

## Profile
Payments PM with nine years across cross-border corridors.

## Experience
### Juspay — Senior Product Manager
- Rebuilt the payouts corridor, lifting settlement success from 91% to 97%.
- Scaled TPV past $1B across 14 markets.
- Ran the closed-loop wallet and EMI programme.
`;

function rec(over: Partial<SimgRecommendation> = {}): SimgRecommendation {
  return {
    id: "r1",
    lens: "recruiter",
    kind: "modify",
    points: 4,
    text: "t",
    detail: "d",
    before: "Scaled TPV past $1B across 14 markets.",
    after: "Scaled TPV past $1B across 14 markets, owning corridor economics.",
    anchorAfter: null,
    requiresConfirmation: false,
    confirm: null,
    state: "pending",
    ...over,
  };
}

describe("validateRecommendations", () => {
  it("keeps an edit whose before text is quoted exactly", () => {
    const { valid, rejected } = validateRecommendations(CV, [rec()]);
    expect(valid).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it("rejects a paraphrased before — it would silently do nothing", () => {
    const { valid, rejected } = validateRecommendations(CV, [
      rec({ before: "Scaled TPV past one billion across fourteen markets." }),
    ]);
    expect(valid).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/not in the CV/);
  });

  it("rejects an ambiguous before that matches twice", () => {
    const doubled = CV + "- Scaled TPV past $1B across 14 markets.\n";
    const { rejected } = validateRecommendations(doubled, [rec()]);
    expect(rejected[0].reason).toMatch(/appears 2 times/);
  });

  it("rejects a second edit targeting the same text — the independence rule", () => {
    const { valid, rejected } = validateRecommendations(CV, [
      rec({ id: "r1" }),
      rec({ id: "r2", after: "Something else entirely." }),
    ]);
    expect(valid.map((r) => r.id)).toEqual(["r1"]);
    expect(rejected[0]).toMatchObject({ id: "r2" });
  });

  it("rejects an insert with no anchor", () => {
    const { rejected } = validateRecommendations(CV, [
      rec({ kind: "insert", before: null, anchorAfter: null, after: "- New." }),
    ]);
    expect(rejected[0].reason).toMatch(/anchorAfter/);
  });
});

describe("applyAccepted", () => {
  it("does nothing while an edit is pending", () => {
    expect(applyAccepted(CV, [rec()])).toBe(CV);
  });

  it("substitutes a modify once accepted", () => {
    const out = applyAccepted(CV, [rec({ state: "accepted" })]);
    expect(out).toContain("owning corridor economics");
    expect(out).not.toContain("across 14 markets.\n- Ran");
  });

  it("removes the whole line on a delete, leaving no blank", () => {
    const out = applyAccepted(CV, [
      rec({
        kind: "delete",
        before: "Ran the closed-loop wallet and EMI programme.",
        after: null,
        state: "accepted",
      }),
    ]);
    expect(out).not.toContain("closed-loop wallet");
    expect(out).not.toMatch(/\n\n\n/);
  });

  it("inserts after the anchor line, not inside it", () => {
    const out = applyAccepted(CV, [
      rec({
        kind: "insert",
        before: null,
        anchorAfter: "- Scaled TPV past $1B across 14 markets.",
        after: "- Coached and grew a team of 6 PMs.",
        state: "accepted",
      }),
    ]);
    const lines = out.split("\n");
    const anchor = lines.findIndex((l) => l.includes("Scaled TPV"));
    expect(lines[anchor + 1]).toBe("- Coached and grew a team of 6 PMs.");
  });

  it("is order-independent across accepted edits", () => {
    const a = rec({ id: "a", state: "accepted" });
    const b = rec({
      id: "b",
      kind: "delete",
      before: "Ran the closed-loop wallet and EMI programme.",
      after: null,
      state: "accepted",
    });
    expect(applyAccepted(CV, [a, b])).toBe(applyAccepted(CV, [b, a]));
  });

  it("undo is a recompute — discarding restores the original exactly", () => {
    const accepted = applyAccepted(CV, [rec({ state: "accepted" })]);
    expect(accepted).not.toBe(CV);
    expect(applyAccepted(CV, [rec({ state: "discarded" })])).toBe(CV);
  });
});

describe("project", () => {
  const evaluation: SimgEvaluation = {
    baseline: { ats: 70, recruiter: 66, hiringManager: 64 },
    current: {
      ats: { score: 82 },
      recruiter: { score: 74 },
      hiringManager: { score: 68 },
    },
    recommendations: [
      rec({ id: "r1", points: 4, state: "accepted" }),
      rec({ id: "r2", points: 3, state: "pending" }),
      rec({ id: "r3", points: 2, state: "discarded" }),
    ],
  };

  it("reports baseline, generated, current and potential", () => {
    const p = project(evaluation, CV);
    expect(p.generated).toBe(74); // 0.3*82 + 0.35*74 + 0.35*68
    expect(p.baseline).toBe(67); // 0.3*70 + 0.35*66 + 0.35*64
    expect(p.current).toBe(78); // 74 + 4 accepted
    expect(p.potential).toBe(81); // + 3 pending; the discarded 2 never counts
  });

  it("caps the projection at 100 however the model priced it", () => {
    const greedy: SimgEvaluation = {
      ...evaluation,
      recommendations: [rec({ id: "x", points: 90, state: "accepted" })],
    };
    expect(project(greedy, CV).current).toBe(100);
  });

  it("flags a derived CV that no longer fits one page", () => {
    const long = CV + "- A bullet that is quite long indeed.\n".repeat(90);
    expect(project(evaluation, long).overflows).toBe(true);
  });
});
