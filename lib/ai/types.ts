import type { JobScoreAnalysis } from "@/db/schema";
import type { AiTaskType, MatchCategory } from "@/lib/config/constants";

/** The job facts every task prompt is built from. */
export type TaskContext = {
  applicationId: string;
  taskType: AiTaskType;
  title: string;
  company: string;
  location?: string | null;
  country?: string | null;
  description: string;
  jobUrl: string;
  visaSponsorshipMentioned?: boolean | null;
  /** ScoreG's Posting Age Modifier (3E) needs this; omitting it forfeits the rule. */
  postedAt?: string | null;
  employmentType?: string | null;
  seniority?: string | null;
  salaryRaw?: string | null;
  /** ScoreG's Reachability component (3D) is manual input by design. */
  reachability?: string | null;
  inboundSourceDetail?: string | null;
};

/**
 * Structured half of a task result.
 *
 * Prompts ask for a fenced ```json block followed by the markdown body, so a
 * score can populate `applications.job_score` while the same response also
 * produces a readable document.
 */
export type TaskPayload = {
  score?: number;
  matchCategory?: MatchCategory;
  visaSignal?: string;
  analysis?: JobScoreAnalysis;
};

export type TaskResult = {
  payload: TaskPayload;
  markdown: string;
  model: string;
  provider: string;
};

/**
 * D4 — the seam between the app and whatever executes Claude.
 *
 * Phase 1 ships `mock` (fixtures) and `claude_local` (the Mac worker running
 * `claude -p` against the Pro subscription). A metered Anthropic API driver is
 * one more implementation of this interface, which is what keeps the grey-area
 * subscription path from being a one-way door.
 */
export interface AiProvider {
  readonly name: string;
  run(context: TaskContext, prompt: string, model: string): Promise<TaskResult>;
}

/**
 * Split a Claude response into its JSON block and markdown body.
 *
 * Tolerant by design: if the model returns markdown with no JSON fence, the
 * document is still usable and only the structured fields are lost.
 */
export function parseTaskResponse(text: string): {
  payload: TaskPayload;
  markdown: string;
} {
  const fence = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!fence) return { payload: {}, markdown: text.trim() };

  let payload: TaskPayload = {};
  try {
    const parsed = JSON.parse(fence[1]) as Record<string, unknown>;
    payload = {
      score:
        typeof parsed.score === "number"
          ? Math.max(0, Math.min(100, Math.round(parsed.score)))
          : undefined,
      matchCategory: parsed.matchCategory as MatchCategory | undefined,
      visaSignal:
        typeof parsed.visaSignal === "string" ? parsed.visaSignal : undefined,
      analysis:
        typeof parsed.analysis === "object" && parsed.analysis !== null
          ? (parsed.analysis as JobScoreAnalysis)
          : undefined,
    };
  } catch {
    // A malformed JSON block should not cost us the document.
  }

  const markdown = text.replace(fence[0], "").trim();
  return { payload, markdown };
}
