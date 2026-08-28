# ADR-0002 — Executing ScoreG and CVG

**Status:** Accepted · **Date:** 2026-08-29 · **Backlog:** JSV2S1080, JSV2S1078

## Context

The existing capabilities (Job scorer, CV optimiser, Message generator,
Technical Guru, Case Study) live as Claude.ai projects — instructions plus
attachments. They are **not** executable Claude Skills and **not** reachable
from an application runtime.

**Claude Pro does not include Anthropic API access.** They are separate products
with separate billing. Verified: no `ANTHROPIC_API_KEY` in the environment, and
the Claude Code binary resolves only through the VSCode extension
(`CLAUDE_CODE_EXECPATH`), not as a global CLI.

Four mechanisms were considered:

| Option | Cost | Constraint |
|---|---|---|
| Local Claude Code worker (`claude -p`) | ₹0 | Mac must be on; shares Pro quota; grey area in consumer terms |
| Anthropic API | metered | Fully sanctioned, synchronous, works from Vercel |
| MCP server driven from Claude Code | ₹0 | Trigger lives in Claude Code, not the dashboard |
| Copy/paste bridge | ₹0 | Rejected — the manual step is what we are removing |

## Decision

**Local Claude Code worker for the MVP**, behind an `AiProvider` interface with
a `mock` driver as the default.

- `mock` — deterministic fixtures. Default. Zero quota consumed. The whole app
  is buildable and testable on it.
- `claude_local` — `workers/ai/run.mjs` on the Mac claims `ai_jobs` rows and
  runs `claude -p --output-format json`.

Models (D5), configurable per task rather than hardcoded:

| Task | Model | Effort |
|---|---|---|
| Job Score | `claude-sonnet-5` | high |
| Resume / Cover Letter | `claude-opus-5` | high |

Claude Code takes effort from `~/.claude/settings.json` (`effortLevel`), not a
per-invocation flag. `AI_EFFORT` is recorded on the row for provenance.

## Division of labour

The worker performs **no domain writes**. It claims a row, runs Claude, and
stores the raw response. `settleAiJobs` in `features/ai/tasks.ts` promotes that
into a document, a score and a timeline event on the next page load.

This is why the worker is a small dependency-light script with raw SQL rather
than a second copy of the application's write path.

## Cost of the alternative

Not paid today, but this is what the API driver would cost, and a proxy for how
hard the Pro quota gets hit. Rates: Opus 5 $5/$25 per MTok, Sonnet 5 $2/$10,
Haiku 4.5 $1/$5. Assumes ~6K in / ~4K out per score (high effort bills thinking
as output) and ~30K in / ~14K out per CV+CL package of three calls.

| Unit | Cost |
|---|---|
| Job score (Sonnet 5) | $0.052 |
| CV + CL package (Opus 5) | $0.50 |

| Cadence | Volume | Cost |
|---|---|---|
| Daily | 10 scores + 2 packages | $1.52 |
| Weekly | 70 + 14 | $10.64 |
| Monthly | 300 + 60 | $45.60 |

Lighter (5 scores + 1 package/day): $0.76/day · $22.80/month.

## Risks

- **Pro quota is the binding constraint, not money.** Opus 5 at high effort
  twice a day competes with the Claude Code sessions used to build this app.
  Mitigation: run the worker on demand (`npm run worker:once`), and if it bites,
  set `MODEL_CV=claude-sonnet-5` — an env change, not a code change.
- **Grey area.** Driving a subscription CLI as an unattended application backend
  is not what the Pro subscription is sold for. Accepted knowingly for personal
  single-user use. The `AiProvider` interface means switching to a metered API
  driver is one new file, so this is not a one-way door.
- **Nothing generates while the Mac is off.** The queue makes that visible
  (tasks show as `queued`) rather than appearing broken.

## Blocked on

`prompts/scoreg/SKILL.md`, `prompts/cvg/SKILL.md` and `prompts/master-resume.md`
must be exported from the Claude projects before `claude_local` can run. The
mock driver is unaffected.
