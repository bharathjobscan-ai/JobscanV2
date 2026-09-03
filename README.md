# JobScanV2

An AI-assisted workspace for a product-management job search that needs visa
sponsorship. Upload jobs, work them as applications, generate a score, a
tailored CV and a cover letter on demand, and track every outcome and attempt.

Phase 1 covers **Manual Ingestion** and **Application Management**. Automated
fetching and analytics are later phases.

---

## Setup

### 1. Supabase

Create a free project at [supabase.com](https://supabase.com), then use the
**Connect** button in the top bar of the project dashboard (not Project
Settings — it moved). Copy two strings from that modal:

| Tab | Port | → |
|---|---|---|
| Transaction pooler | `6543` | `DATABASE_URL` |
| Session pooler | `5432` | `DIRECT_URL` |

Two strings, not one: the app runs on the pooler, but `drizzle-kit` migrations
need a session/direct connection. DDL through the transaction pooler fails in
confusing ways.

Use the **Session pooler** for `DIRECT_URL`, not the "Direct connection" tab —
`db.<ref>.supabase.co` is IPv6-only on new free projects, so it times out on
most home ISPs.

> **Percent-encode the password.** The string contains a literal
> `[YOUR-PASSWORD]` placeholder you must replace. If your password contains
> `%`, `@`, `/`, `#`, `?` or `:`, encode it — `%` becomes `%25`, `@` becomes
> `%40`. An unencoded `%` fails with a bare `URIError: URI malformed`.

### 2. Configure and start

```bash
cp .env.example .env.local     # then fill in both connection strings
npm install
npm run db:migrate             # creates the six tables
npm run dev                    # http://localhost:3000
```

`AI_PROVIDER` defaults to `mock`, so every feature works immediately with
fixture output and no Claude usage.

### 3. Upload something

Go to **Upload**, download the template, or use
`tests/fixtures/sample-jobs.csv` — deliberately imperfect, so you can see how
malformed and duplicate rows are handled.

---

## Real AI generation

Generation calls the provider APIs **inline and synchronously** — no worker, no
queue, no polling. Reasoning: [ADR-0005](docs/decisions/0005-provider-apis.md),
which supersedes ADR-0002.

Export your existing capabilities into `prompts/` (see
[prompts/README.md](prompts/README.md)):

- `prompts/scoreg/SKILL.md`
- `prompts/cvg/SKILL.md`
- `prompts/master-resume.md`

Then set `AI_PROVIDER=live` in `.env.local`, with keys for whichever providers
you route to:

```bash
AI_PROVIDER="live"
GEMINI_API_KEY="..."
ANTHROPIC_API_KEY="..."

PROVIDER_SCORING="gemini_api"      # Google Search grounding on the visa pillar
PROVIDER_CV="anthropic_api"        # long-form quality + prompt caching
```

Routing is **per task** and configurable, so switching a task to another provider
or model is an env change, not a code change. `AI_PROVIDER=mock` runs the whole
app on deterministic fixtures and spends nothing.

Results appear immediately; `settleAiJobs` also re-runs on page load as an
idempotent safety net.

> **Money, not quota, is the binding constraint.** Every generation is billed per
> token — measured, roughly $0.07–0.09 per grounded score. Run
> `npm run ai:report` for actual usage and cost, and `npm run ai:bench` to
> compare providers on the same job.

---

## Deploying to Vercel

Import the repo, then set:

| Variable | Value |
|---|---|
| `DATABASE_URL` | transaction pooler URL |
| `APP_PASSWORD` | **required** — the app holds personal data on a public URL |
| `AI_PROVIDER` | `mock`, unless you leave the worker running |

The worker stays on your Mac and needs `DIRECT_URL`.

---

## Verification

Unit tests need no database:

```bash
npm test && npm run typecheck && npm run build
```

The database-backed checklist is automated. It seeds the fixture, asserts each
behaviour, and cleans up after itself — scoped to the fixture companies, so it
is safe to run against a database holding real applications:

```bash
npm run test:integration
```

It covers: upload counts (**7 inserted · 1 duplicate · 2 rejected**), per-row
rejection reasons, the incomplete-description flag, auto-created applications
(D1), idempotent re-upload, view partitioning, derived `deemed_pending` without
a stored status change, the full lifecycle with one event per transition,
independent attempts with their own emails and outcomes, mock generation of all
three documents, version-on-regenerate, and cascade deletes.

Two steps still need a human:

- **Real AI** — with the worker running, trigger a score. The `ai_jobs` row goes
  `queued → running → succeeded`, then settles into a document and a score. Kill
  the worker mid-run: the row is retried, not lost.
- **Deploy** — a wrong password is rejected; the dashboard reads live data with
  the worker offline.

---

## Documentation

| | |
|---|---|
| [docs/architecture/overview.md](docs/architecture/overview.md) | The shape, and the simplifications behind it |
| [docs/decisions/](docs/decisions/) | ADR-0001…0005 (ADR-0002 is superseded by ADR-0005) |
| [docs/product/open-decisions.md](docs/product/open-decisions.md) | Unresolved conflicts across the source documents |
| [TASKBOARD.md](TASKBOARD.md) | Execution status, traceable to backlog IDs |
| [AGENTS.md](AGENTS.md) | Conventions and constraints for AI assistants |

## Commands

| | |
|---|---|
| `npm run dev` | Local app |
| `npm run db:migrate` | Apply schema |
| `npm run db:studio` | Browse the data |
| `npm test` | Unit tests (no database) |
| `npm run test:integration` | Database-backed verification |
| `npm run ai:report` | Measured token usage and real cost per run |
| `npm run ai:bench` | Compare providers/models on the same job |
| `npm run ai:models` | List available Gemini models |
| `npm run typecheck` / `npm run build` | |
