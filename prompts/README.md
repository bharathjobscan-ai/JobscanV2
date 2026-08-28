# Prompts

Source-controlled copies of the Claude capabilities that already exist as
projects in Claude.ai. They are **plain markdown, not executable Claude Skills**
— the worker pastes them into a `claude -p` invocation as context.

## Required before `AI_PROVIDER=claude_local` will run

| Path | Source | Used by |
|---|---|---|
| `scoreg/SKILL.md` | Job scorer project | Job Score |
| `cvg/SKILL.md` | CV optimiser project | Resume, Cover Letter |
| `master-resume.md` | Your current master CV, in markdown | Resume, Cover Letter, Score |

Optional:

| Path | Purpose |
|---|---|
| `candidate-profile.md` | Standing context — target roles, locations, visa position |

Until these exist, the app runs on `AI_PROVIDER=mock` and every other feature —
upload, workspace, versioning, download, timeline, attempts — works normally.
Generation with the real provider raises a clear `MissingPromptError` naming the
file it wants rather than failing obscurely.

## Exporting them

1. Open the Claude project (Job scorer / CV optimiser).
2. Copy the project instructions into the matching `SKILL.md`.
3. Copy any attached reference files into the same folder and reference them
   from `SKILL.md`.

## Output contract

`lib/ai/prompts.ts` appends an output contract to every prompt asking for a
fenced `json` block followed by the markdown document. The JSON populates
`applications.job_score`, `match_category`, `visa_signal` and
`job_score_analysis`; the markdown becomes the stored document.

A response with no JSON block still produces a usable document — only the
structured fields are lost. Keep your skill instructions compatible with that
contract, or adjust `OUTPUT_CONTRACT` in `lib/ai/prompts.ts` to match how your
skills already format their output.
