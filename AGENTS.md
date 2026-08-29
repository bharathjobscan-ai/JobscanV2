# JobScanV2 — guide for AI assistants

Personal, single-user tool. Zero-cost infrastructure is a hard constraint, not a
preference.

## Read first

1. [docs/architecture/overview.md](docs/architecture/overview.md) — the shape and why
2. [docs/decisions/](docs/decisions/) — ADR-0001…0004, the reasoning behind the model
3. [docs/product/open-decisions.md](docs/product/open-decisions.md) — unresolved conflicts (C1–C5)
4. [TASKBOARD.md](TASKBOARD.md) — status, traceable to backlog IDs

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase Postgres ·
Drizzle ORM · Vercel · GitHub Actions (Phase 2).

## Rules that are easy to break accidentally

- **No new paid services, containers, Redis, or queues.** The `ai_jobs` table
  plus a polling loop is the queue, deliberately.
- **No supabase-js for data access.** Everything goes through Drizzle,
  server-side. Supabase keys must never reach the browser.
- **Deterministic code for CRUD, validation, dedupe, filtering, file handling.**
  AI is for scoring, tailoring, cover letters, gap analysis — reasoning work.
- **`deemed_pending` is derived, never stored.** Do not add it to
  `APPLICATION_STATUSES`. See ADR-0001.
- **The worker performs no domain writes.** It stores a raw result;
  `settleAiJobs` in `features/ai/tasks.ts` is the only write path from AI output
  to documents/score/events. Do not duplicate that logic into the worker.
- **Prompt markdown under `/prompts` is not an executable Claude Skill,** and
  Claude Pro does not grant API access. See ADR-0002.
- **Don't silently reconcile conflicting requirements** across the PRD, backlog
  and design documents. Record them in `docs/product/open-decisions.md`.

## Conventions

- Schema: one file per table in `db/schema/`, re-exported from `index.ts`.
- Enums live in `lib/config/constants.ts` as `as const` arrays; columns are
  `text` with `$type<>()`, validated by Zod at the boundary (ADR-0003).
- Business logic in `features/<domain>/`; server actions in `actions.ts`;
  queries in `queries.ts`; writes in `mutations.ts`.
- Multi-table writes go in one `db.transaction`.
- `lib/config/env.ts` is server-only. `lib/config/constants.ts` is safe on the
  client.

## Commands

```bash
npm run dev          # local app
npm run worker       # local Claude Code worker (AI_PROVIDER=claude_local)
npm run db:push      # apply schema
npm test             # unit tests, no database needed
npm run typecheck
npm run build
```

## Traceability

Product tasks are `JSV2S####`; execution subtasks are `JSV2S####-T##`. Reference
the ID in code comments where a non-obvious requirement drove the design, and
update `TASKBOARD.md` when status changes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
