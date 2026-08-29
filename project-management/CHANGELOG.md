# Project management changelog

Version history for the PRD, the product backlog and the execution tracker.
Newest first. Each entry records what changed and why.

Artifacts are versioned **together** under one release number, so a given
version of the PRD always corresponds to a known state of the backlog.

---

## v1.2 — 2026-08-29 — Open decisions closed, token accounting added

### Decisions

- **C1 resolved: 14 days.** `DEEMED_PENDING_DAYS` default changed from 21 to 14.
  Affects the Pending dashboard view immediately and the future Ghost Rate.
  Because the state is derived rather than stored, the change reclassifies
  existing applications on the next read — which is the intended behaviour.
- **C4 resolved: outreach is Phase 2**, not Phase 1.5. On the Application board,
  invoked on request. JSV2S1089–1093 moved from Deferred to Phase 2 /
  Not Started.

### Added

- **Measured token usage.** `ai_jobs.usage` captures the input, output and cache
  token counts Claude Code reports per run, plus its own cost figure and
  duration. Cost per job is now measured rather than estimated.
- `lib/ai/pricing.ts` — rate table and cost computation, including cache read
  and write multipliers.
- `npm run ai:report` — per-run detail, per-task averages, cost of one fully
  processed application, and projections at daily, weekly and monthly cadence.
- `prompts/EXPORT-GUIDE.md` — exactly what to export from each Claude project,
  under what filename.

### Schema

- Migration `0001_ai_job_usage` adds `ai_jobs.usage` (jsonb, nullable). Additive
  only; no backfill needed.

---

## v1.1 — 2026-08-29 — Phase 1 delivered

Phase 1 (Manual Ingestion + Application Management) built, validated against a
live Supabase database, and pushed.

### PRD

- **Added §9.1** Application status model. Three source documents disagreed on
  naming and on whether `Offer` exists. Resolved to the design-document naming
  with `Offer` restored, because Conversion Rate has no terminal success state
  without it.
- **Added §9.2** `Deemed Pending` is derived, never stored. Prevents the future
  Ghost Rate from inheriting forgotten status updates.
- **Added §9.3** Job-to-application creation rule, distinguishing MVP
  (auto-create, since uploads are pre-filtered externally) from Phase 2
  (create on passing pre-qualification).
- **Added §9.4** AI execution mechanism, with the correction that **Claude Pro
  does not include API access**. Four mechanisms assessed; local Claude Code
  worker chosen. Indicative metered cost recorded for the alternative.
- **Added §9.5** Per-task model selection — Sonnet 5 for scoring, Opus 5 for
  CV and cover letter, both at high effort.
- **Added §9.6** Hosting and access control — Vercel with a single-password gate;
  all database access server-side through Drizzle.
- **Added §10** Data model. Six tables rather than the four originally scoped;
  document storage and an AI queue were required by P0 items.
- **Added §11** Five open conflicts (C1–C5), recorded rather than reconciled.
- **Added §12** Phase boundaries.
- **Clarified §3 and §4** that the existing Claude workflows are project
  instructions, not executable Skills, and must be exported to `/prompts/`.

### Product backlog

- Added `Phase`, `Status` and `Notes` columns to all 124 items.
- **33 items → Completed.** JSV2S1007–1009, 1031–1034, 1036, 1039, 1041,
  1047–1048, 1061, 1074–1088, 1094–1098.
- **5 items → Deferred.** JSV2S1089–1093 (outreach), pending C4.
- Remaining 86 assigned to Phase 2 or Phase 3.
- Recorded that several Phase 2 items already have their foundations in place —
  `raw_jobs` columns for LinkedIn extraction, retry behaviour in `ai_jobs`,
  row-level failure isolation from the upload path.

### Execution tracker

- Created. 56 subtasks against Phase 1 product items, typed and status-tracked.
- 51 Completed, 3 Blocked (all needing user action), 2 Not Started (Vercel deploy).

### Notable corrections during the build

- `getEnv` treated an empty environment value as present-but-invalid rather than
  unset, so a fresh checkout following the README failed at startup. Caught by
  the new integration suite.
- Switched from `drizzle-kit push` to `drizzle-kit migrate`. The committed
  migration is versioned and reproducible; `push` also requires an interactive
  terminal.
- Documented three Supabase setup facts learned the hard way: the connection
  string moved to the **Connect** button; `DIRECT_URL` should use the session
  pooler because the direct host is IPv6-only on new free projects; and a
  password containing `%` must be percent-encoded or the driver fails with a
  bare `URIError: URI malformed`.

---

## v1.0 — 2026-08 — Baseline

- PRD as originally written: vision, principles, subscriptions, journey so far,
  journey ahead, high-level user flow, tech and infra architecture, project
  structure, module architecture.
- Product backlog as originally written: 124 items, JSV2S1001–JSV2S1124, with
  Layer, Module, Epic, Story, Task and Description. Priority set to P0 on the
  23 Application Management items; blank elsewhere. No status tracking.
- Application Management and Application Analytics design documents.
- No execution tracker.
