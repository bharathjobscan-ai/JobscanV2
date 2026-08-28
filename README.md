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

The app enqueues work; a worker on your Mac executes it against your Claude Pro
subscription. Vercel cannot spawn Claude Code, which is why generation is
asynchronous. Full reasoning and cost analysis: [ADR-0002](docs/decisions/0002-ai-execution.md).

```bash
npm i -g @anthropic-ai/claude-code   # must be on PATH, or set CLAUDE_BIN
```

Export your existing capabilities into `prompts/` (see
[prompts/README.md](prompts/README.md)):

- `prompts/scoreg/SKILL.md`
- `prompts/cvg/SKILL.md`
- `prompts/master-resume.md`

Then set `AI_PROVIDER=claude_local` in `.env.local` and run:

```bash
npm run worker        # poll continuously
npm run worker:once   # drain the queue and exit
```

Results appear in the workspace on the next page load. With the worker stopped,
tasks queue rather than failing.

Models are per task (`MODEL_SCORING`, `MODEL_CV`). Claude Code takes its effort
level from `~/.claude/settings.json`, not a flag.

> Pro quota, not money, is the binding constraint. The worker shares your
> subscription with the Claude Code sessions you use to develop this app. If it
> bites, set `MODEL_CV=claude-sonnet-5` — an env change, not a code change.

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
| [docs/decisions/](docs/decisions/) | ADR-0001…0004 |
| [docs/product/open-decisions.md](docs/product/open-decisions.md) | Unresolved conflicts across the source documents |
| [TASKBOARD.md](TASKBOARD.md) | Execution status, traceable to backlog IDs |
| [AGENTS.md](AGENTS.md) | Conventions and constraints for AI assistants |

## Commands

| | |
|---|---|
| `npm run dev` | Local app |
| `npm run worker` | Local Claude Code worker |
|  `npm run db:migrate` | Apply schema |
| `npm run db:studio` | Browse the data |
| `npm test` | Unit tests (no database) |
| `npm run test:integration` | Database-backed verification |
| `npm run typecheck` / `npm run build` | |
