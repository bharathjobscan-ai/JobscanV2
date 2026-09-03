# Product documentation

## Where your documents go

Drop the originals here so the repository is self-contained for reviewers
(Gemini, Antigravity) who have no access to chat history.

| Your file | Put it here |
|---|---|
| Base PRD | `docs/product/prd-v1.0-original.md` |
| Product Backlog / Task board | `docs/product/product-backlog-original.md` |
| Application Management design | `docs/product/application-management.md` |
| Application Analytics design | `docs/product/application-analytics.md` |
| Any other product design docs | `docs/product/<topic>.md` |
| Architecture diagrams (png/svg/excalidraw) | `docs/architecture/` |

Markdown and images both commit fine. Diagrams exported as PNG or SVG are worth
committing even if the source lives in Excalidraw or Figma — a reviewer that
cannot open the source can still see the picture.

## Original versus living

Keep them distinct, or they drift and nobody knows which is authoritative:

| | Location | Role |
|---|---|---|
| **Originals** | `docs/product/` | Historical record. Do not edit — suffix `-original` where a living version exists. |
| **Living PRD** | `project-management/prd/PRD.md` | Currently v1.2. Updated as decisions are made, with version history. |
| **Living backlog** | `project-management/backlog/product-backlog.csv` | All 124 items with Phase, Status and Notes. |

The base PRD is the exception worth naming carefully: `prd-v1.0-original.md`
here is the frozen input; `project-management/prd/PRD.md` is what we maintain.
The Application Management and Analytics design documents have no living
counterpart, so they keep their plain names.

## Where decisions live

| Question | Read |
|---|---|
| What are we building and why? | `project-management/prd/PRD.md` |
| Why was it built this way? | `docs/decisions/` (ADR-0001…0004) |
| What is still unresolved? | `docs/product/open-decisions.md` |
| What changed between versions? | `project-management/CHANGELOG.md` |
| What is the state of each item? | `project-management/backlog/product-backlog.csv` |

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

## Backlog coverage

| Range | Area | Status |
|---|---|---|
| JSV2S1007–1009, 1031–1034, 1036, 1039, 1041, 1047–1048 | RawJob schema, upload, validation, dedupe | Completed |
| JSV2S1061, 1074–1088, 1094–1098 | Application management, gap display | Completed |
| 37 stories across W1–W7 | Scheduled ingestion, pre-qualification, auto-scoring, digest, SimG, cost | **Phase 1.5** — 25 Ready, 12 Blocked |
| JSV2S1089–1093 | Outreach | Phase 2 (C4) |
| JSV2S1002–1005, 1018, 1023–1030, 1046 | Adapter framework, other sources, watchers | Phase 2 |
| JSV2S1059, 1062–1063, 1126 | CV optimiser refinements and recommendation review | Phase 2 |
| JSV2S1064–1073 | Preparation | Phase 3 |
| JSV2S1099–1124 | Application Analytics | Phase 3 |
| JSV2S1128–1129, 1133 | Infrastructure and data usage | Phase 3 |

Live status: `project-management/backlog/product-backlog.csv`.
