import { readFile } from "node:fs/promises";
import path from "node:path";

import type { AiTaskType } from "@/lib/config/constants";
import type { TaskContext } from "./types";

/**
 * Existing Claude capabilities live in source control under /prompts, per the
 * operating principles. They are plain markdown — they are NOT executable
 * Claude Skills, and nothing here assumes they are. The worker pastes them into
 * a `claude -p` invocation as context.
 */
const SKILL_FILES: Record<AiTaskType, string> = {
  score: "scoreg/SKILL.md",
  tailor_cv: "cvg/SKILL.md",
  cover_letter: "cvg/SKILL.md",
};

const PROMPTS_DIR = path.join(process.cwd(), "prompts");

export class MissingPromptError extends Error {
  constructor(relativePath: string) {
    super(
      `Missing prompt file: prompts/${relativePath}\n\n` +
        `Export the corresponding skill from your Claude project into that path. ` +
        `Until then, run with AI_PROVIDER=mock.`,
    );
  }
}

async function readOptional(relativePath: string): Promise<string | null> {
  try {
    return await readFile(path.join(PROMPTS_DIR, relativePath), "utf8");
  } catch {
    return null;
  }
}

async function readRequired(relativePath: string): Promise<string> {
  const content = await readOptional(relativePath);
  if (content === null) throw new MissingPromptError(relativePath);
  return content;
}

const OUTPUT_CONTRACT = `
## Output contract

Respond with a fenced \`json\` block, then the document body as markdown.

\`\`\`json
{
  "score": 0-100,
  "matchCategory": "perfect_match" | "dicey_match" | "rejection_pool",
  "visaSignal": "short phrase describing sponsorship evidence",
  "analysis": {
    "summary": "one paragraph",
    "strengths": ["..."],
    "gaps": ["..."],
    "visaSignals": ["..."],
    "breakdown": { "dimension": "score or note" }
  }
}
\`\`\`

Then the readable report or document in markdown. For resume and cover letter
tasks include only \`analysis.summary\` and \`analysis.gaps\` in the JSON block.
`.trim();

function jobBlock(context: TaskContext): string {
  return [
    "## Job",
    `Title: ${context.title}`,
    `Company: ${context.company}`,
    context.location ? `Location: ${context.location}` : null,
    context.country ? `Country: ${context.country}` : null,
    `URL: ${context.jobUrl}`,
    context.visaSponsorshipMentioned !== null &&
    context.visaSponsorshipMentioned !== undefined
      ? `Sponsorship mentioned in posting: ${context.visaSponsorshipMentioned}`
      : null,
    "",
    "### Job description",
    context.description,
  ]
    .filter(Boolean)
    .join("\n");
}

const TASK_INSTRUCTION: Record<AiTaskType, string> = {
  score:
    "Score this job for the candidate using the ScoreG method above. Weigh visa sponsorship likelihood, domain relevance and experience fit.",
  tailor_cv:
    "Produce a tailored one-page resume for this job using the CV optimiser method above. Apply the ATS format check and call out domain gaps.",
  cover_letter:
    "Produce a tailored cover letter for this job using the method above. Keep it to one page and specific to this company and role.",
};

/**
 * Assemble the full prompt at enqueue time.
 *
 * Frozen into the ai_jobs row so the worker needs no domain knowledge, and so
 * replaying a failed job reproduces the identical request.
 */
export async function buildPrompt(context: TaskContext): Promise<string> {
  const skill = await readRequired(SKILL_FILES[context.taskType]);
  const masterResume = await readRequired("master-resume.md");
  const profile = await readOptional("candidate-profile.md");

  return [
    "You are executing a saved JobScan workflow. Follow the method exactly.",
    "",
    "# Method",
    skill,
    "",
    "# Candidate master resume",
    masterResume,
    profile ? `\n# Candidate profile\n${profile}` : "",
    "",
    `# Task\n${TASK_INSTRUCTION[context.taskType]}`,
    "",
    jobBlock(context),
    "",
    OUTPUT_CONTRACT,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Whether the real provider can run at all, for a clear UI message. */
export async function promptsAvailable(): Promise<{
  ok: boolean;
  missing: string[];
}> {
  const required = ["scoreg/SKILL.md", "cvg/SKILL.md", "master-resume.md"];
  const missing: string[] = [];
  for (const file of required) {
    if ((await readOptional(file)) === null) missing.push(file);
  }
  return { ok: missing.length === 0, missing };
}
