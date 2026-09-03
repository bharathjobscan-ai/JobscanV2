# ADR-0005 — Direct provider APIs, per task

**Status:** Accepted · **Date:** 2026-09-02 · **Supersedes:** [ADR-0002](0002-ai-execution.md)
**Backlog:** JSV2S1080, JSV2S1078 · **Commit:** `7b67664`

## Context

[ADR-0002](0002-ai-execution.md) chose a local Claude Code worker driving the
Claude Pro subscription, with an `ai_jobs` queue between the app and the worker.
That decision held for the length of the Phase 1 build and then failed on four
counts, in order of how much each one hurt:

1. **It blocked deployment.** Vercel cannot spawn Claude Code. The whole
   asynchronous design — the queue table, the polling loop, the settle-on-page-load
   step — existed only to work around that. Hosting was the point of ADR-0004, and
   ADR-0002 made it unreachable.
2. **Nothing generated while the Mac was off.** ADR-0002 named this as an accepted
   risk. In practice a job-search tool that only works when a laptop is open is a
   tool you stop trusting.
3. **Scoring quality was capped by what one model could establish.** Measured:
   Gemini's Google Search grounding resolved a UK sponsor-register entry that
   three consecutive Claude Code runs could not.
4. **The consumer-terms grey area never resolved.** Driving a subscription CLI as
   an unattended backend was accepted knowingly; it does not survive contact with
   a scheduled daily run (Phase 1.5).

Meanwhile the thing ADR-0002 was avoiding — metered API cost — turned out to be
small enough to measure precisely rather than fear.

## Decision

**Call the provider APIs directly and synchronously, routed per task.**

`AiProvider` (the seam ADR-0002 introduced, and the reason this was not a
rewrite) now has three implementations:

| Provider | `name` | Used for |
|---|---|---|
| `GeminiProvider` | `gemini_api` | Job scoring, with Google Search grounding |
| `AnthropicProvider` | `anthropic_api` | Resume and cover letter |
| `MockProvider` | `mock` | Fixtures; default; consumes nothing |

Routing is configuration, not code — `PROVIDER_SCORING` and `PROVIDER_CV` select
per task, with `MODEL_SCORING`/`MODEL_CV` and `MODEL_SCORING_GEMINI`/`MODEL_CV_GEMINI`
naming the model on each side.

**Routing is per task because the two providers differ on the axes that matter,
and this was measured rather than assumed.** Gemini's search grounding wins on
visa-sponsorship evidence, which is 50% of the score. Claude leads on long-form
document generation, and its prompt caching makes the repeated ~5k-token skill
prefix nearly free after the first call. `npm run ai:bench` is the harness that
keeps this evidence-based as models change.

## What this removed

- `workers/ai/run.mjs` — deleted.
- The `npm run worker` script — deleted.
- The polling loop, and the asynchronous execution model with it.
- `AI_PROVIDER=claude_local` — the values are now `mock` and `live`.

`enqueueTask` in `features/ai/tasks.ts` keeps its name but no longer enqueues:
it runs the provider inline and inserts the `ai_jobs` row already at
`succeeded`. The caller gets a finished result instead of a promise to poll.

## What survived, and why

**`ai_jobs` stays**, no longer as a queue but as the **run ledger**. It is the
only record of what was asked, of which model answered, and — through
`ai_jobs.usage` — of what it cost. Phase 1.5's cost reporting (JSV2S1132) reads
from it, and Phase 1.5's scheduled orchestration (JSV2S1136) needs exactly the
resumability a row-per-run gives.

**`settleAiJobs` stays the single write path** from AI output to documents,
score and events. ADR-0002 justified this by keeping domain logic out of the
worker; with no worker the reasoning changes but the rule does not — one write
path means one place where a malformed response is handled.

## Known debris

`ai_jobs.status` still allows `queued` and `running`, `ai_jobs.attempts` is never
incremented, and `ai_jobs_status_queued_idx` indexes a state nothing writes.
JSV2S1136 must either revive these for the scheduled path — where a run genuinely
can be interrupted and resumed — or remove them. **Do not treat their presence as
evidence that a queue exists.**

## Consequences

**Cost is now real money.** ADR-0002's figures were hypothetical: "what this
would cost if metered". They are now the bill. Measured, roughly $0.07–0.09 per
grounded score and materially more per document package.

The Pro quota is no longer the binding constraint, which removes the ADR-0002
risk about competing with development sessions. It is replaced by a different
one: spend scales with volume, and Phase 1.5 puts volume on a cron. That is what
JSV2S1137 (spend ceiling) exists to answer.

**Zero-cost is no longer strictly true.** `AGENTS.md` states it as a hard
constraint. It now means *no new paid infrastructure* — no containers, no Redis,
no queue service, no paid hosting — while metered AI calls and, in Phase 1.5, an
Apify actor are accepted deliberately and tracked. Recorded here rather than
quietly redefined.

**Claude Pro still does not grant API access.** That fact from ADR-0002 is
unchanged and still explains why `ANTHROPIC_API_KEY` is a separate, billed
credential. What changed is that we now pay for it rather than route around it.
