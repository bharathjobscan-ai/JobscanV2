# Execution task board

**Current as of 2026-09-04.** Phase 1 delivered · Phase 1.5 in progress.

Traceability: the master backlog holds product tasks (`JSV2S####`); execution
subtasks (`JSV2S####-T##`) are created only when a product task is selected.
Work with no product parent uses an epic ID (`E6-T04`).

Status values: Not Started · Ready · In Progress · Blocked · Review · Completed · Deferred

A parent item is Completed only when the product outcome is implemented **and
validated**. Phase 1 was validated against a live Supabase database by
`npm run test:integration` (15 assertions covering upload, dedupe, views,
lifecycle, attempts, generation and cascade deletes), plus 188 unit tests, lint,
typecheck and a production build.

> `project-management/tracker/execution-tracker.csv` is the machine-readable
> record and the authority when the two disagree. This file is the readable view.

---

## Phase 1 — delivered

E1 Foundation, E2 Manual ingestion (JSV2S1031–1034), E3 Application dashboard
(JSV2S1074–1077), E4 Preparation (JSV2S1078–1081), E5 Lifecycle / referral /
attempts / history (JSV2S1082–1098), E7 Documentation — **all Completed.**
Row-level detail is in the execution tracker.

### E6 · AI layer — superseded in part

| ID | Type | Task | Status |
|---|---|---|---|
| E6-T01 | [AI] | `AiProvider` interface | Completed |
| E6-T02 | [AI] | Mock driver + deterministic fixtures | Completed |
| E6-T03 | [DB] | `ai_jobs` run ledger | Completed |
| E6-T04 | [AI] | Local worker: claim → `claude -p` → store | **Deferred — retired** |
| E6-T05 | [Backend] | `settleAiJobs` — the single write path | Completed |
| E6-T06 | [Frontend] | Queued / running / failed chips | Completed |
| E6-T07 | [Product] | Export ScoreG + CVG + master resume to `/prompts/` | Completed |
| E6-T08 | [QA] | Verify real generation end to end | In Progress |

**E6-T04 was retired, not finished.** Commit `7b67664` (2026-09-02) deleted
`workers/ai/run.mjs` and the `npm run worker` script. See
[ADR-0005](docs/decisions/0005-provider-apis.md), which supersedes ADR-0002:
providers are now called inline and synchronously, there is no queue and no
polling, and `ai_jobs` is a run ledger rather than a work queue.

### E8 · Live providers and deployment

| ID | Type | Task | Status |
|---|---|---|---|
| E8-T01 | [QA] | Integration suite against a live database | Completed |
| E8-T05 | [AI] | Anthropic + Gemini API drivers | Completed |
| E8-T02 | [Infra] | Deploy to Vercel | Not Started |
| E8-T03 | [QA] | Verify the password gate on the deployed URL | Not Started |
| E8-T04 | [QA] | Verify cover letter generation end to end | Not Started |

---

## Phase 1.5 — in progress

**38 stories: 17 `Review` · 13 `Ready` · 8 `Blocked`.** Marked in
`project-management/backlog/product-backlog.csv` with `Phase = Phase 1.5`.

Scope decisions taken: scoring is automated but **document generation stays
manual**; execution is **GitHub Actions cron**, not Vercel; the multi-source
adapter framework and Application Analytics are deliberately out.

| # | Workstream | Review | Ready | Blocked |
|---|---|---|---|---|
| W1 | LinkedIn ingestion on a schedule (Apify) | 8 | 5 | 2 |
| W2 | Data cleansing and lifecycle classification | 1 | 1 | — |
| W3 | Pre-qualification into piles | 5 | — | — |
| W4 | Automated scoring + score quality | 1 | 2 | 3 |
| W5 | Daily digest mailer | — | 3 | 1 |
| W6 | Mandatory SimG (Pass G) | — | 2 | 1 |
| W7 | Per-application AI cost visibility | 2 | — | 1 |
| | **Total** | **17** | **13** | **8** |

`Review` means implemented and unit-tested but **not yet validated against a
live database** — migrations `0005` and `0006` are generated and unapplied.

### Built 2026-09-03

JSV2S1132 (per-application AI cost), JSV2S1049 (CI), JSV2S1010/1011/1012/1013/
1014/1015 (ingestion run ledger, logging, metrics, isolation, retry, DLQ),
JSV2S1040 (lifecycle classification), JSV2S1001 (source adapter contract).

### Built 2026-09-04 — the pre-qualification gate

| ID | What |
|---|---|
| JSV2S1054 | Taxonomy — roles, domains, locations, experience, thresholds |
| JSV2S1037 | The four filter rules, with four corrections to the source PRD |
| JSV2S1055 | `pass` / `review` / `reject` — closes conflict **C3** |
| JSV2S1052 | ScoreG bands stand — the other half of C3 |
| JSV2S1038 | Gate wired into `ingestRows`; review queue at `/review` |
| JSV2S1056 | `config/prequalification/` as TS-as-data, with a config version |
| JSV2S1138 | Preferred cities, identified and highlighted *(new story)* |
| JSV2S1040 | Now wired — `content_hash` exists |

Also: **ADR-0006** (the gate and the D1 amendment), migration `0006`, 51 new
unit tests, and two new integration assertions covering the gated path.

### Sequencing from here

1. Apply migrations `0005` and `0006`, then run `npm run test:integration`.
2. **JSV2S1127** UK sponsor register — cuts per-score cost, fixes a measured
   scoring failure. Independent of everything else.
3. **W1** ingestion — needs JSV2S1019/1020 answered first.
4. **W4** orchestration, then **W5** digest and **W6** SimG.

---

## Blocked on you

**Eight backlog decisions**, down from twelve. The ask is recorded in each row's
`Notes`:

| Order | ID | Decision needed |
|---|---|---|
| 1 | JSV2S1019 | Which Apify LinkedIn actor, and the budget ceiling |
| 2 | JSV2S1020 | Keywords, locations, recency, result cap |
| 3 | JSV2S1053 | Domain skill set sign-off |
| 4 | JSV2S1051 | Visa evidence weights |
| 5 | JSV2S1050 | ScoreG locations |
| 6 | JSV2S1042 | Daily digest contents |
| 7 | JSV2S1060 | Optimisation threshold |
| 8 | JSV2S1137 | Whether you want a spend ceiling at all |

**Conflict C3 is resolved** (2026-09-04), which closed JSV2S1037, 1052, 1054 and
1055. [docs/product/open-decisions.md](docs/product/open-decisions.md) now has no
open conflicts.

**Two spend acknowledgements** are implied by the Phase 1.5 scope: Apify is a
paid dependency, and automated scoring turns a per-click cost into roughly
$60–80/month unattended. Both are recorded in ADR-0005 and PRD §9.7.

---

## Deferred

| Scope | Reason |
|---|---|
| Source adapter framework — JSV2S1002–1005, 1018, 1046 | Configuration plumbing for one source. Build it when source #2 is real. |
| Other fetchers — JSV2S1023–1026 | Phase 2 |
| Career-site watchers — JSV2S1027–1030 | Phase 2 |
| Outreach — JSV2S1089–1093 | Phase 2 (C4) |
| Application Analytics — JSV2S1099–1124 | Phase 3. Ratios over outcomes need months of data; `application_events` is already capturing it. |
| Infra usage tracking — JSV2S1128, 1129, 1133 | Phase 3. The provider dashboards already show this. |
| Interview preparation — JSV2S1064–1073 | Phase 3 |
| Supabase Storage, PDF export | Until a measurable need (JSV2S1126) |
