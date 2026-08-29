# Project management

Versioned product artifacts. The markdown and CSV files are the **source of
truth**; the `.docx` files under `build/` are generated for reading and sharing.

```
project-management/
  CHANGELOG.md                     version history for everything here
  prd/PRD.md                       the living PRD
  backlog/product-backlog.csv      all 124 product items, JSV2S1001-1124
  tracker/execution-tracker.csv    execution subtasks
  build/                           generated .docx (do not edit)
```

## Formats, and why

| Artifact | Format | Why |
|---|---|---|
| PRD, changelog | Markdown → `.docx` | Prose. Converts cleanly and opens in Word and Google Docs. |
| Backlog, tracker | CSV | Real columns. Sorts and filters in Excel, Numbers and Google Sheets. |

`.docx` is produced by macOS `textutil`, which is built in — no dependency, no
cost. It preserves headings, bold and italic but **flattens HTML tables into one
cell per line**, which is why the tabular artifacts stay as CSV rather than being
forced into a document.

## Regenerating the documents

```bash
npm run pm:docs
```

Reads every `.md` in this folder, converts it, and writes
`build/<Name>-v<version>.docx`. The version comes from the newest entry in
`CHANGELOG.md`, so bumping that is the only place a version number is written.

## Versioning

All artifacts share one release number, so a given PRD version always
corresponds to a known backlog state.

When something changes:

1. Edit the markdown or CSV.
2. Add or extend the entry at the top of `CHANGELOG.md`, saying what changed and
   why.
3. Run `npm run pm:docs`.
4. Commit source and generated documents together.

## Status values

Backlog and tracker both use: `Not Started` · `Ready` · `In Progress` ·
`Blocked` · `Review` · `Completed` · `Deferred`.

A product item is `Completed` only when the outcome is implemented **and
validated**. Items resting on unvalidated behaviour say so in Notes.

## Relationship to the rest of the repository

| Here | Elsewhere |
|---|---|
| `prd/PRD.md` — what we are building and why | `docs/decisions/` — ADRs with the full engineering reasoning |
| `backlog/product-backlog.csv` — all 124 items | `TASKBOARD.md` — the Phase 1 working view |
| `CHANGELOG.md` — product-level history | `git log` — code-level history |

`docs/product/open-decisions.md` holds the same C1–C5 conflicts as PRD §11, with
more detail on impact and options.
