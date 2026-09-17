import { createHash } from "node:crypto";

import type { AiProvider, TaskContext, TaskResult } from "./types";

/**
 * Fixture provider (USE_MOCK_AI / AI_PROVIDER=mock).
 *
 * Lets the whole application — upload, workspace, versioning, timeline,
 * download — be built and tested without consuming a single token of Claude Pro
 * quota. Output is deterministic per job so tests can assert on it.
 */
export class MockProvider implements AiProvider {
  readonly name = "mock";

  async run(
    context: TaskContext,
    _prompt: string | { system: string; user: string },
    model: string,
  ): Promise<TaskResult> {
    const seed = parseInt(
      createHash("sha256")
        .update(`${context.company}|${context.title}`)
        .digest("hex")
        .slice(0, 8),
      16,
    );

    switch (context.taskType) {
      case "score":
        return this.score(context, model, seed);
      case "tailor_cv":
        return this.resume(context, model);
      case "cover_letter":
        return this.coverLetter(context, model);
      case "simg":
        return this.simg(context, model, seed);
    }
  }

  private score(context: TaskContext, model: string, seed: number): TaskResult {
    const score = 62 + (seed % 34); // 62–95

    const analysis = {
      summary: `Mock analysis for ${context.title} at ${context.company}. Generated without calling a model — set AI_PROVIDER=live for a real score.`,
      strengths: [
        "Product management experience aligns with the role's core scope",
        "Payments and fintech domain overlap",
        "Track record of shipping with cross-functional teams",
      ],
      gaps: [
        "Limited evidence of experience in this specific market",
        "Sponsorship signal not confirmed against the registry",
      ],
      visaSignals: [
        context.visaSponsorshipMentioned
          ? "Posting explicitly mentions sponsorship"
          : "No explicit sponsorship statement in the posting",
      ],
      breakdown: {
        visa: context.visaSponsorshipMentioned ? "strong" : "unconfirmed",
        domain: "good",
        experience: "good",
        location: context.country ?? "unspecified",
      },
    };

    const markdown = [
      `# Job Score — ${context.title}`,
      `**${context.company}**${context.location ? ` · ${context.location}` : ""}`,
      "",
      `## Score: ${score}/100`,
      "",
      analysis.summary,
      "",
      "## Strengths",
      ...analysis.strengths.map((s) => `- ${s}`),
      "",
      "## Gaps",
      ...analysis.gaps.map((g) => `- ${g}`),
      "",
      "## Visa signals",
      ...analysis.visaSignals.map((v) => `- ${v}`),
      "",
      "---",
      "_Mock output. No Claude usage was consumed._",
    ].join("\n");

    return {
      payload: {
        // The decision band is derived from the score in settleAiJobs, so the
        // mock deliberately does not supply one.
        score,
        visaSignal: context.visaSponsorshipMentioned
          ? "Sponsorship mentioned"
          : "Unconfirmed",
        analysis,
      },
      markdown,
      model,
      provider: this.name,
    };
  }

  private resume(context: TaskContext, model: string): TaskResult {
    const markdown = [
      "# Candidate Name",
      "Product Manager · email@example.com · linkedin.com/in/example",
      "",
      "## Summary",
      `Product manager positioned for ${context.title} at ${context.company}.`,
      "",
      "## Experience",
      "### Senior Product Manager — Current Company",
      "- Delivered outcome relevant to this role",
      "- Led cross-functional initiative with measurable impact",
      "",
      "## Skills",
      "Product strategy · Payments · Roadmapping · Stakeholder management",
      "",
      "---",
      "_Mock resume. No Claude usage was consumed._",
    ].join("\n");

    return {
      payload: {
        analysis: {
          summary: "Mock tailoring pass.",
          gaps: ["Domain depth in this vertical"],
        },
      },
      markdown,
      model,
      provider: this.name,
    };
  }

  /**
   * A SimG evaluation whose worklist actually applies (JSV2S1058).
   *
   * The anchors are quoted from `context.cvMarkdown` rather than hard-coded,
   * because `validateRecommendations` drops any edit whose `before` is not
   * present verbatim. A fixture with invented anchors would validate to an
   * empty worklist and the mock would silently prove nothing.
   */
  private simg(context: TaskContext, model: string, seed: number): TaskResult {
    const cv = context.cvMarkdown ?? "";
    const bullets = cv
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => line.trim());

    const recommendations: Record<string, unknown>[] = [];

    if (bullets[0]) {
      recommendations.push({
        id: "r1",
        lens: "recruiter",
        kind: "modify",
        points: 4,
        text: "Lead the bullet with the corridor outcome, not the activity.",
        detail: "The six-second scan reaches the verb before the result.",
        section: "Experience",
        before: bullets[0],
        after: `${bullets[0].replace(/\.$/, "")}, cutting settlement failures by a third.`,
        anchorAfter: null,
        requiresConfirmation: false,
        confirm: null,
      });
    }

    if (bullets[1]) {
      recommendations.push({
        id: "r2",
        lens: "hiring_manager",
        kind: "insert",
        points: 3,
        text: "Name the coaching responsibility explicitly.",
        detail: "Weighted in the brief and absent from the CV.",
        section: "Experience",
        before: null,
        after: "- Coached and grew a team of six product managers.",
        anchorAfter: bullets[1],
        // Deliberately set: exercises the confirmation gate in the UI, which is
        // the one path that must never be auto-accepted.
        requiresConfirmation: true,
        confirm: "Confirm you have line-managed or coached PMs.",
      });
    }

    return {
      payload: {
        simg: {
          baseline: { ats: 70, recruiter: 64, hiringManager: 62 },
          current: {
            ats: { score: 82, note: "Two must-have keywords absent." },
            recruiter: { score: 74, note: "Impact is below the fold." },
            hiringManager: { score: 68, note: "No competitor-analysis evidence." },
          },
          keywords: {
            mustHaveFound: 8 + (seed % 3),
            mustHaveTotal: 12,
            goodToHaveFound: 4,
            goodToHaveTotal: 9,
            missing: ["multi-currency accounts", "transaction banking"],
          },
          recommendations,
        },
      },
      markdown: "Mock SimG evaluation. No provider usage was consumed.",
      model,
      provider: this.name,
    };
  }

  private coverLetter(context: TaskContext, model: string): TaskResult {
    const markdown = [
      `## Cover Letter — ${context.company}`,
      "",
      "Dear Hiring Manager,",
      "",
      `I am writing regarding the ${context.title} role at ${context.company}.`,
      "This is mock content generated without calling Claude.",
      "",
      "Kind regards,",
      "Candidate Name",
      "",
      "---",
      "_Mock cover letter. No Claude usage was consumed._",
    ].join("\n");

    return {
      payload: { analysis: { summary: "Mock cover letter." } },
      markdown,
      model,
      provider: this.name,
    };
  }
}
