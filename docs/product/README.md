# Product documentation

## Source of truth

Four documents govern this system. Place the originals here so the repository is
self-contained for reviewers (Gemini, Antigravity) who do not have your chat
history:

| File | Status |
|---|---|
| `prd.md` | to add — export "PRD - JScan" |
| `product-backlog.md` | to add — export the Task board, IDs JSV2S1001–1124 |
| `application-management.md` | to add — the design document |
| `application-analytics.md` | to add — the design document |

Where they conflict, [open-decisions.md](open-decisions.md) records the conflict
and what was decided; resolved architecture and product decisions live in
[docs/decisions/](../decisions/).

## Phase 1 scope

Manual Ingestion + Application Management.

```
Upload CSV/XLSX/JSON
  → validate & dedupe
  → raw_jobs + an application per job
  → Application Dashboard (5 views)
  → Application Workspace
       job context · score · resume · cover letter
       status · referral · attempts · timeline
  → on-demand generation (score / CV / CL)
```

## Explicitly out of Phase 1

Automated fetching, Apify and LinkedIn, other job boards, scheduler and CRON,
career-site watchers, Application Analytics, outreach (see C4), Supabase
Storage, PDF generation.

## Backlog coverage

| Range | Area | Phase 1 |
|---|---|---|
| JSV2S1007–1009 | RawJob schema, versioning, RAW_JOBS | ✅ |
| JSV2S1031–1034 | Manual upload, validation, source traceability | ✅ |
| JSV2S1074–1077 | Application dashboard, views, detail, job context | ✅ |
| JSV2S1078–1081 | Resume, cover letter, download, score, analysis | ✅ |
| JSV2S1082–1085 | Status model, outcomes, history, deemed-pending | ✅ |
| JSV2S1086–1088 | Referral tracking | ✅ |
| JSV2S1094–1098 | Attempts, reapplication, timeline, history | ✅ |
| JSV2S1089–1093 | Outreach | deferred (C4) |
| JSV2S1001–1006, 1010–1030 | Ingestion platform + fetchers | Phase 2 |
| JSV2S1035–1049 | Pre-qualification, notification, CI | Phase 2 |
| JSV2S1050–1073 | Intelligence, Optimization, Preparation | existing capabilities |
| JSV2S1099–1124 | Application Analytics | Phase 3 |

Live status: [TASKBOARD.md](../../TASKBOARD.md).
