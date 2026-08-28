# Architecture — Phase 1

## Shape

```
Vercel (Next.js App Router, password proxy)
  │  all DB access server-side via Drizzle
  ├─→ Supabase Postgres ──┐
  │                       │  ai_jobs (queued)
  └─ "Generate CV" ───────┘       ↑
                                  │ poll
     Your Mac: workers/ai/run.mjs ┘
        └─ claude -p --output-format json   (Claude Pro subscription)
             └─→ writes the raw result back onto the ai_jobs row
                   ↑
     App settles it into documents / score / events on next page load
```

## The one consequential constraint

Vercel cannot spawn Claude Code. Hosting on Vercel (D3) and executing against
the Pro subscription (D4) therefore cannot happen in the same process, which is
why generation is **asynchronous** and why `ai_jobs` exists.

Everything else follows from that: the queue table, the local worker, and the
settle step.

## Deliberate simplifications

| Choice | Instead of | Why |
|---|---|---|
| Drizzle over `postgres`, server-side only | supabase-js in the browser | One data path. Supabase keys never reach the client, so RLS stays trivial. |
| Markdown in a Postgres column | Supabase Storage | The PRD defers PDFs; this removes a dependency entirely. `storagePath` is reserved for when PDFs are real. |
| `ai_jobs` table + polling loop | Redis / Celery / a queue service | One table and a `setTimeout`. No recurring cost, nothing to operate. |
| `text` columns + Zod | `pgEnum` | Three taxonomies (match category, ScoreG outcomes, pre-qualification) are still open backlog items. Enum migrations are painful; Zod validation is not. |
| One `application_events` table | separate status-history and timeline tables | Two tables would be two versions of the same truth. |
| Worker does no domain writes | worker writing documents directly | Keeps the entire write path in one TypeScript file (`features/ai/tasks.ts`) rather than a second copy in the worker. |

## Layout

```
app/                      Next.js routes
  (dashboard)/            application dashboard, workspace, upload
  api/documents/[id]/     download a generated document
  login/                  password gate
components/               presentational + client forms
features/                 business logic
  ingestion/              parse → validate → dedupe → persist
  applications/           queries + transactional mutations
  ai/                     enqueue + settle
lib/
  ai/                     provider interface, prompts, mock driver
  config/                 constants (shared) + env (server)
  db/                     Drizzle client
db/schema/                one file per table
workers/ai/run.mjs        local Claude Code worker
config/                   upload template
prompts/                  exported Claude capabilities (see prompts/README.md)
docs/                     product, architecture, decisions
tests/                    unit tests + fixtures
```

## Data model

Six tables. `raw_jobs` is the canonical job record and stays source-agnostic so
Phase 2 adapters write to it unchanged. `applications` is the workspace record,
1:1 with a job in Phase 1 (D1). `application_attempts` carries per-try outcomes.
`application_events` is append-only. `application_documents` versions generated
material. `ai_jobs` is the work queue.

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
`ingestRows` (validate → dedupe in-file → dedupe against DB → insert jobs +
applications + events in one transaction).

**Status change** → `changeStatusAction` → `changeStatus` — one transaction
updating the application, stamping the active attempt's outcome, and appending
an event.

**Generation** → `generateAction` → `enqueueTask`. Mock runs inline and settles
immediately; `claude_local` leaves a queued row. `settleAiJobs` runs on every
dashboard and workspace load and promotes finished results.

## Testing

`npm test` covers validation, coercion, fingerprinting, parsers for all three
formats, the status model invariants, the next-action rules, and response
parsing — none of which need a database. Database-touching behaviour is
verified through the checklist in the README.
