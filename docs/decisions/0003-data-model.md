# ADR-0003 — Phase 1 data model

**Status:** Accepted · **Date:** 2026-08-29 · **Backlog:** JSV2S1007–1009, JSV2S1074–1098

## Six tables, not four

The Phase 1 brief specified `raw_jobs`, `applications`, `application_attempts`
and `application_timeline`. That set cannot carry the P0 scope:

- JSV2S1078/1079 (attach and download tailored CV/CL) need document storage →
  `application_documents`
- [ADR-0002](0002-ai-execution.md) needs a work queue → `ai_jobs`

`application_timeline` is named `application_events`.

## One events table, not two

JSV2S1084 asks for status history; JSV2S1097 asks for an activity timeline.
These are one append-only log, not two tables — two would be two versions of the
same truth.

It ships in Phase 1 even though Application Analytics is Phase 3, because every
Phase 3 metric (funnel conversion, ghost rate, time analysis) is computed from
status transitions with timestamps, and those **cannot be reconstructed
retroactively**.

## Job → Application: auto-create

MVP uploads are pre-filtered outside the system, so every valid row becomes an
application at `ready_to_apply` immediately, in the same transaction as the job
insert. Enforced 1:1 by a unique index on `applications.raw_job_id`.

Phase 2 changes this: jobs that pass prequalification become applications, with
score, CV and CL pre-generated. Jobs that fail stay in `raw_jobs` with no
application — which is why the two tables are separate now rather than merged.

## Referral as columns, not a table

There is at most one referral per application (JSV2S1086–1088), so
`referral_status`, `referrer_name` and `referral_notes` live on `applications`.
A join table would be ceremony.

## Status lives on the application; outcome lives on the attempt

Application Management.md §4 specifies a parent application with child attempts,
and JSV2S1096 wants to compare outcomes across attempts.

The rule: the user changes status on the **application**. That single write, in
one transaction:

1. updates `applications.status` — current truth, what the dashboard filters on
2. stamps `outcome` on the active attempt — so attempts stay comparable
3. appends an event

Moving to `applied` with no attempt on record opens attempt 1 automatically. The
user should not have to think about the attempts model to record an ordinary
application.

`email_used` is a first-class column because the PRD notes that re-applying from
a fresh address at the right moment sometimes produces a shortlist.

## Text columns, not `pgEnum`

Three taxonomies are still open backlog items — match category (JSV2S1052),
pre-qualification taxonomy (JSV2S1054) and match classification (JSV2S1055).
Postgres enum migrations are painful; Zod validation at the boundary plus
Drizzle's `$type<>()` gives type safety without freezing a decision that has not
been made. Revisit when ScoreG is finalised.

## Identity and dedupe

Highest confidence first:

1. `(source, source_job_id)` — unique index, partial on `source_job_id not null`
2. `fingerprint` — `sha256(company | title | location)`, normalised and unique

The fingerprint deliberately excludes the URL: the same posting often has
several URLs (tracking parameters, mirrored boards), which would defeat it.

Duplicates advance `last_seen_at` rather than inserting — evidence the listing
is still live (JSV2S1041).

## Documents: markdown in Postgres

The PRD says no PDF library initially, so Phase 1 needs no Supabase Storage at
all — one less dependency. `storage_path` is reserved for when PDFs become real.

Documents are versioned rather than overwritten, because regenerating a resume
must not orphan the version an attempt referenced.
