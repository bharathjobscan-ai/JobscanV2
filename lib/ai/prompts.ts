import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  REACHABILITY_LABELS,
  type AiTaskType,
  type ReachabilityLevel,
} from "@/lib/config/constants";
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

/**
 * Heading convention the .docx renderer parses (lib/documents/parse.ts).
 *
 * The CVG skill itself no longer carries file-generation or typography
 * instructions — those moved into lib/documents/docx.ts, so they are applied
 * identically every run instead of being re-derived by the model. All that is
 * left to state here is the markdown shape the parser expects.
 */
const DELIVERY_OVERRIDE = `
## Markdown structure

So the renderer maps your output correctly, use \`#\` for the name, \`##\` for
section headers, \`###\` for role and company lines, and \`-\` for bullets.
`.trim();

const OUTPUT_CONTRACT = `
## Output contract

Respond with a fenced \`json\` block, then the document body as markdown.

\`\`\`json
{
  "score": 0-100,
  "visaSignal": "short phrase describing sponsorship evidence",
  "analysis": {
    "summary": "one paragraph",
    "strengths": ["..."],
    "gaps": ["..."],
    "visaSignals": ["..."],
    "breakdown": [
      { "pillar": "Visa Intelligence", "component": "Intent Signals",
        "awarded": 0, "max": 20,
        "reason": "why these points were withheld or earned" }
    ],
    "finalCalculation": "(A x 0.50) + (B x 0.30) + (C x 0.20) = N",
    "exceptions": ["any hard override applied, and why"]
  }
}
\`\`\`

Then the readable report or document in markdown.

\`analysis.breakdown\` must contain **one entry per scored sub-component**, not
one per pillar. Use the method's own rubric: every named component with its own
maximum gets its own line — Structural Eligibility, Behavioral Signals and
Intent Signals under Visa Intelligence; Domain, Functional PM and Seniority
under Resume Match; Location, Role Alignment, Experience Fit, Reachability and
Posting Age under Job Relevance.

Where a component is itself additive from named signals, add a line for each of
those too, so a withheld point is traceable to the rule that withheld it. Give
every line a \`reason\` — for anything scoring below its maximum, say precisely
what was missing and which rule applied.

The decision band is computed from the score by the application; do not state or
invent one.

**Score reports:** the application renders the breakdown table, the weighted
calculation and the overrides from the JSON above, so **do not repeat any of
them in the markdown**. Use the markdown only for what the structured fields
cannot carry: the entity you resolved, what each search returned, how you
weighed conflicting evidence, and the application strategy. Keep it under 400
words.

**Resume and cover letter:** keep the markdown to the document itself, and
include only \`analysis.summary\` and \`analysis.gaps\` in the JSON block.
`.trim();

/**
 * Everything captured at upload that a scoring rule depends on.
 *
 * Omissions here are silent scoring failures: leaving out the posting date made
 * ScoreG report "no posting date provided" and forfeit its Posting Age Modifier
 * even though the value was sitting in the database.
 */
function jobBlock(context: TaskContext): string {
  // Drizzle may hand back a Date or a string depending on driver mode; the
  // model should always see an unambiguous ISO date.
  const postedAt = context.postedAt
    ? new Date(context.postedAt).toISOString().slice(0, 10)
    : null;

  const reachability = context.reachability
    ? (REACHABILITY_LABELS[context.reachability as ReachabilityLevel] ??
      context.reachability)
    : null;

  return [
    "## Job",
    `Title: ${context.title}`,
    `Company: ${context.company}`,
    context.location ? `Location: ${context.location}` : null,
    context.country ? `Country: ${context.country}` : null,
    `URL: ${context.jobUrl}`,
    postedAt
      ? `Posted on: ${postedAt} (today is ${new Date().toISOString().slice(0, 10)})`
      : "Posted on: not provided",
    context.employmentType ? `Employment type: ${context.employmentType}` : null,
    context.seniority ? `Seniority: ${context.seniority}` : null,
    context.salaryRaw ? `Salary: ${context.salaryRaw}` : null,
    reachability ? `Reachability: ${reachability}` : "Reachability: not provided",
    context.inboundSourceDetail ? `Lead source: ${context.inboundSourceDetail}` : null,
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
    // Only CV/CL output is parsed into a .docx; a score report stays markdown.
    context.taskType === "score" ? "" : DELIVERY_OVERRIDE,
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
