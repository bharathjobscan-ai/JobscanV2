repo: bharathjobscan-ai/JobscanV2
branch: main

## Last sync

date: 2026-08-30T00:00:00Z

### Updated in this project

- Redesigned the Application Detail workspace: score + verdict hero, decision bar with status control at the top.
- Redesigned the Applications board as an editorial decision table (score, decision band, visa, referral, next action).
- Domain vocabulary (9 statuses, referral states, match bands, next actions) lifted from `lib/config/constants.ts`.

## Screen map

| Project screen | Repo files |
| --- | --- |
| JobScan Workspace.dc.html — Application Detail | app/(dashboard)/applications/[id]/page.tsx, components/applications/*.tsx, lib/config/constants.ts |
| JobScan Workspace.dc.html — Applications board | app/(dashboard)/applications/page.tsx, components/applications/badges.tsx, lib/config/constants.ts |
