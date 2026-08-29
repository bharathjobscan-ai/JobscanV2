# Project management

**Markdown and CSV are the source of truth.** There is no generated-document
step — a consolidated, formatted requirement document is produced on request
only (JSV2S1125, Phase 4).

```
project-management/
  CHANGELOG.md                     version history for everything here
  prd/PRD.md                       the living PRD
  backlog/product-backlog.csv      product items, JSV2S1001-1125
  tracker/execution-tracker.csv    execution subtasks for picked-up items
```

## The two levels

| | Holds | Who adds to it |
|---|---|---|
| **Backlog** | Stories, epics and tasks — the product-level definition of what to build | You define them; they get the next `JSV2S####` |
| **Tracker** | `JSV2S####-T##` subtasks — the technical, design and QA breakdown | Created **only when an item is picked up for implementation** |

An item sitting in the backlog has **no** tracker rows. Breaking down work that
has not been scheduled means designing it before deciding it.

## Formats, and why

| Artifact | Format | Why |
|---|---|---|
| PRD, changelog | Markdown | Reads as-is, diffs cleanly in git, renders on GitHub. |
| Backlog, tracker | CSV | Real columns. Sorts and filters in Excel, Numbers and Google Sheets. |

## Keeping it live

Both files are maintained, not snapshots:

- **Ask for a story, epic or task** and it goes into the backlog with the next
  `JSV2S####`, plus Layer, Module, Epic, Story, Task, Description, Phase, Status
  and Notes.
- **When an item is picked up**, it moves to `In Progress` and gets its `-T##`
  subtasks in the tracker, typed `[Product]` `[Design]` `[Frontend]` `[Backend]`
  `[DB]` `[Infra]` `[AI]` `[Integration]` `[QA]`.
- **When work closes**, subtasks and the parent both move to `Completed`, with a
  note saying what proves it — a test, a verified behaviour, or a deliberate
  limitation.

A parent item reaches `Completed` only when the outcome is implemented **and
validated**. Anything resting on unvalidated behaviour says so in Notes.

## Versioning

The PRD and backlog share one release number, so a PRD version always
corresponds to a known backlog state.

1. Edit the markdown or CSV.
2. Add or extend the entry at the top of `CHANGELOG.md`, saying what changed and why.
3. Commit.

## Status values

`Not Started` · `Ready` · `In Progress` · `Blocked` · `Review` · `Completed` · `Deferred`

## Phases

| Phase | Scope |
|---|---|
| Phase 1 | Manual ingestion + application management — delivered |
| Phase 2 | Outreach, automated ingestion, scoring and CV-optimiser refinements |
| Phase 3 | Application analytics, interview preparation |
| Phase 4 | Consolidated requirement document generation (JSV2S1125) |

## Relationship to the rest of the repository

| Here | Elsewhere |
|---|---|
| `prd/PRD.md` — what we are building and why | `docs/decisions/` — ADRs with the engineering reasoning |
| `backlog/product-backlog.csv` — every product item | `TASKBOARD.md` — the Phase 1 working view |
| `tracker/execution-tracker.csv` — subtasks in flight | `git log` — code-level history |

`docs/product/open-decisions.md` holds the C1-C5 conflicts with more detail on
impact and options.
