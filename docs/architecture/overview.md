# Architecture — Phase 1 (as built)

Current as of 2026-09-04. Phase 1.5 is partly built: the pre-qualification gate
and the run ledger exist; scheduled ingestion itself does not.

## Shape

```
Vercel (Next.js App Router, password proxy)
  │  all DB access server-side via Drizzle
  ├─→ Supabase Postgres (Mumbai; functions co-located)
  │
  └─ "Generate score" / "Generate CV"
        └─ enqueueTask()  ── inline, synchronous ──┐
                                                    │
              score ──→ Gemini API (+ Google Search grounding)
              cv/cl ──→ Anthropic API (+ prompt caching)
                                                    │
        └─ writes one ai_jobs row at `succeeded` ───┘
              └─ settleAiJobs() promotes it into
                 documents / score / events, in one transaction
```

## How this got here

An earlier design (ADR-0002) queued work in `ai_jobs` and had a local Claude
Code worker on the developer's Mac poll for it, because Vercel cannot spawn
Claude Code. That was retired in ADR-0005: the app now calls the provider APIs
directly, so there is **no queue, no worker and no polling**, and generation is
synchronous.

If you find a document describing a worker, it predates 2026-09-02.

## The one consequential constraint

Not execution any more — **cost**. Every generation is billed per token, so the
levers that matter are prompt size, which model runs which task, and how often
generation is triggered. `ai_jobs.usage` records real token counts per run;
`lib/ai/pricing.ts` turns them into money.

Routing is per task because the providers were measured, not assumed, to differ:
Gemini's search grounding resolves visa-sponsorship evidence Claude could not,
and Claude's caching plus long-form quality wins on documents. `npm run ai:bench`
keeps that decision evidence-based.

## Deliberate simplifications

| Choice | Instead of | Why |
|---|---|---|
| Drizzle over `postgres`, server-side only | supabase-js in the browser | One data path. Supabase keys never reach the client, so RLS stays trivial. |
| Markdown in a Postgres column | Supabase Storage | The PRD defers PDFs; this removes a dependency entirely. `storagePath` is reserved for when PDFs are real. |
| `ai_jobs` as a run ledger | no record, or a metrics service | One row per AI call gives cost attribution and reproducibility for free. It was a queue until ADR-0005; the table survived its original purpose. |
| `text` columns + Zod | `pgEnum` | Both taxonomies are settled now (C3, 2026-09-04), but the pre-qualification vocabulary should see real volume before a check constraint freezes it. Enum migrations are painful; Zod validation is not. |
| One `application_events` table | separate status-history and timeline tables | Two tables would be two versions of the same truth. |
| `settleAiJobs` is the sole write path | each provider writing its own results | One place to handle a malformed response, and settling stays idempotent — which is what makes a scheduled run safe to retry. |

## Layout

```
app/                      Next.js routes
  (dashboard)/            application dashboard, workspace, review queue, upload
  api/documents/[id]/     download a generated document
  login/                  password gate
components/               presentational + client forms
features/                 business logic
  ingestion/              parse → validate → dedupe → pre-qualify → persist
  prequalification/       the deterministic gate (ADR-0006)
  applications/           queries + transactional mutations
  ai/                     run a task + settle the result
lib/
  ai/                     provider interface, gemini, anthropic, mock, prompts, pricing
  config/                 constants (shared) + env (server)
  db/                     Drizzle client
  documents/              markdown → .docx renderer
db/schema/                one file per table
config/                   upload template + prequalification rules (TS-as-data)
prompts/                  exported Claude capabilities (see prompts/README.md)
scripts/ai-usage-report.mjs  measured token usage and cost
docs/                     product, architecture, decisions
tests/                    unit tests + fixtures
```

## Data model

Eight tables. `raw_jobs` is the canonical job record and stays source-agnostic so
Phase 2 adapters write to it unchanged. `applications` is the workspace record,
1:1 with a job in Phase 1 (D1). `application_attempts` carries per-try outcomes.
`application_events` is append-only. `application_documents` versions generated
material. `ai_jobs` is the run ledger — one row per AI call, carrying the prompt,
the model, the raw result and measured token usage. `ingestion_runs` and
`ingestion_failures` record what each source execution did (JSV2S1010, 1015).

Since ADR-0006 a `raw_jobs` row can exist **without** an application: that is a
screened-out job. `applications.rawJobId` was always `notNull().unique()` with a
comment anticipating it, so no schema change was needed for the absence — only
four columns on `raw_jobs` recording the verdict.

### Why `application_events` ships in Phase 1

Application Analytics is Phase 3, but every metric it needs — funnel conversion,
ghost rate, time analysis — is computed from **status transitions with
timestamps**. Those cannot be reconstructed retroactively. Capturing them now is
what makes Phase 3 possible without a data migration.

### Derived, not stored

`deemed_pending` is computed (`status = applied` and `applied_at` older than
`DEEMED_PENDING_DAYS`), never written. See
[ADR-0001](../decisions/0001-application-status-model.md).

## Request paths

**Upload** → `uploadJobsAction` → `parseUploadFile` (format-specific) →
`ingestRows` (validate → dedupe in-file → dedupe against DB → **pre-qualify** →
insert jobs + applications + events in one transaction).

**Pre-qualification** (ADR-0006) is deterministic and runs before persistence:
four rule-based filters produce `pass` / `review` / `reject`, stored on the
`raw_jobs` row with the evidence. On a scheduled run only a `pass` gets an
application; a manual upload always does. A screened-out job is a `raw_jobs` row
with no application, visible only at `/review` — every query in
`features/applications/queries.ts` is rooted at `applications` and cannot see
it.

**Status change** → `changeStatusAction` → `changeStatus` — one transaction
updating the application, stamping the active attempt's outcome, and appending
an event.

**Generation** → `generateAction` → `enqueueTask` → `providerFor(taskType)` runs
the API call inline → one `ai_jobs` row at `succeeded` → `settleAiJobs` promotes
it into documents, score and events in one transaction. `settleAiJobs` also runs
on dashboard and workspace load, as an idempotent safety net.

`enqueueTask` keeps its name from the queue era but does not enqueue. Renaming it
is deferred until JSV2S1136 settles whether the scheduled path reintroduces a
genuine queued state.

## Testing

`npm test` covers validation, coercion, fingerprinting, parsers for all three
formats, the status model invariants, the next-action rules, and response
parsing — none of which need a database. Database-touching behaviour is
verified through the checklist in the README.
