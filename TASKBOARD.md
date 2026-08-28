# Execution task board — Phase 1

Traceability: Master backlog holds product tasks (`JSV2S####`); execution
subtasks (`JSV2S####-T##`) are created only when a product task is selected.

Status values: Not Started · Ready · In Progress · Blocked · Review · Completed · Deferred

A parent item is Completed only when the product outcome is implemented **and
validated**. Everything below is `Review` rather than `Completed` because it has
not yet run against a real Supabase database — see
[README](README.md#verification) for the checklist that closes them out.

---

## E1 · Foundation

| ID | Type | Task | Status |
|---|---|---|---|
| JSV2S1007-T01 | [DB] | RawJob canonical schema | Review |
| JSV2S1008-T01 | [DB] | `schema_version` column | Review |
| JSV2S1009-T01 | [DB] | `raw_jobs` table + identity indexes | Review |
| E1-T04 | [Infra] | Next.js 16 + Tailwind 4 + TypeScript scaffold | Completed |
| E1-T05 | [Infra] | Drizzle + `postgres` client, pooler-safe | Completed |
| E1-T06 | [DB] | Six tables, indexes, `drizzle.config.ts` | Review |
| E1-T07 | [Infra] | Password proxy + login | Review |
| E1-T08 | [Infra] | Supabase project + connection strings | **Blocked — needs your account** |

## E2 · Manual ingestion — JSV2S1031–1034

| ID | Type | Task | Status |
|---|---|---|---|
| JSV2S1031-T01 | [Product] | `config/upload-template.csv` + field reference UI | Review |
| JSV2S1032-T01 | [Backend] | CSV / XLSX / JSON parsers behind one interface | Review |
| JSV2S1032-T02 | [Backend] | Auto-create an application per job (D1) | Review |
| JSV2S1033-T01 | [Backend] | Row-level validation with per-row rejection | Review |
| JSV2S1033-T02 | [Backend] | Identity resolution + in-file and DB dedupe | Review |
| JSV2S1034-T01 | [Backend] | `inbound_source_detail` capture | Review |
| JSV2S1031-T02 | [Frontend] | Upload page + result summary | Review |
| E2-T08 | [QA] | Unit tests + `tests/fixtures/sample-jobs.csv` | Completed |

## E3 · Application dashboard — JSV2S1074–1077

| ID | Type | Task | Status |
|---|---|---|---|
| JSV2S1074-T01 | [Frontend] | Unified dashboard | Review |
| JSV2S1075-T01 | [Frontend] | Five views, non-overlapping | Review |
| JSV2S1075-T02 | [Backend] | Derived `deemed_pending` (C2) | Review |
| JSV2S1076-T01 | [Frontend] | Application detail workspace | Review |
| JSV2S1077-T01 | [Frontend] | Job context panel + source/apply links | Review |
| E3-T06 | [Design] | Next-action rules | Review |

## E4 · Preparation — JSV2S1078–1081

| ID | Type | Task | Status |
|---|---|---|---|
| JSV2S1078-T01 | [DB] | `application_documents`, versioned | Review |
| JSV2S1078-T02 | [Frontend] | Resume + cover letter panels | Review |
| JSV2S1079-T01 | [Backend] | Download route with meaningful filenames | Review |
| JSV2S1080-T01 | [Frontend] | Job score display | Review |
| JSV2S1081-T01 | [Frontend] | Strengths, gaps, visa signals, full analysis | Review |

## E5 · Lifecycle, referral, attempts, history

| ID | Type | Task | Status |
|---|---|---|---|
| JSV2S1082-T01 | [DB] | Status model (ADR-0001) | Review |
| JSV2S1083-T01 | [Backend] | Transactional status change | Review |
| JSV2S1084-T01 | [DB] | `application_events`, append-only | Review |
| JSV2S1085-T01 | [Backend] | Deemed-pending derivation | Review |
| JSV2S1086-T01 | [Frontend] | Referral status | Review |
| JSV2S1087-T01 | [Frontend] | Referrer name + notes | Review |
| JSV2S1088-T01 | [Backend] | Referral events on the timeline | Review |
| JSV2S1094-T01 | [DB] | `application_attempts` | Review |
| JSV2S1095-T01 | [Frontend] | Attempt capture incl. `email_used` | Review |
| JSV2S1096-T01 | [Backend] | Per-attempt outcome | Review |
| JSV2S1097-T01 | [Frontend] | Activity timeline + notes | Review |
| JSV2S1098-T01 | [DB] | Full history preserved | Review |

## E6 · AI layer

| ID | Type | Task | Status |
|---|---|---|---|
| E6-T01 | [AI] | `AiProvider` interface | Completed |
| E6-T02 | [AI] | Mock driver + deterministic fixtures | Completed |
| E6-T03 | [DB] | `ai_jobs` queue | Review |
| E6-T04 | [AI] | Local worker: claim → `claude -p` → store | Review |
| E6-T05 | [Backend] | `settleAiJobs` — the single write path | Review |
| E6-T06 | [Frontend] | Queued / running / failed chips | Review |
| E6-T07 | [Product] | Export ScoreG + CVG + master resume to `/prompts/` | **Blocked — needs you** |

## E7 · Documentation

| ID | Type | Task | Status |
|---|---|---|---|
| E7-T01 | [Product] | ADR-0001 … ADR-0004 | Completed |
| E7-T02 | [Product] | `docs/architecture/overview.md` | Completed |
| E7-T03 | [Product] | `docs/product/open-decisions.md` (C1–C5) | Completed |
| E7-T04 | [Product] | README with setup + verification | Completed |
| E7-T05 | [Product] | Add the four source documents to `docs/product/` | **Blocked — needs you** |

---

## Deferred

| Scope | Reason |
|---|---|
| Outreach JSV2S1089–1093 | P0 in backlog, absent from MVP pipeline — see C4 |
| Application Analytics JSV2S1099–1124 | Phase 3. Schema already captures what it needs |
| Automated ingestion JSV2S1001–1030 | Phase 2 |
| Supabase Storage, PDF export | PRD defers until a measurable need |

## Blocked on you

1. **Supabase project** — create it, paste both connection strings into
   `.env.local`, run `npm run db:push`.
2. **Export the prompts** — `prompts/scoreg/SKILL.md`, `prompts/cvg/SKILL.md`,
   `prompts/master-resume.md`. Mock mode works without them.
3. **C1** — 14 or 21 days.
4. **C4** — confirm deferring outreach.
5. **Source documents** into `docs/product/`.
