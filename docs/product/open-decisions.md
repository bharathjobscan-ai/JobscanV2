# Open product decisions

Conflicts found across the PRD, the Product Backlog, Application Management.md
and Application Analytics.md. Recorded rather than silently reconciled.

Resolved items are in [docs/decisions/](../decisions/).

**Status as of 2026-09-04: every conflict on this page is resolved.** C3 was
the last one; see below.

---

## C1 · Waiting period before an application reads as Pending — RESOLVED

**Was.** PRD (p2): "Deemed Rejected (after 2 weeks of no response)".
Application Analytics §6: "a defined waiting period of **21 days**".

**Resolved 2026-08-29: 14 days.** The PRD's "2 weeks" stands; the Analytics
document's 21 days is superseded. `DEEMED_PENDING_DAYS` defaults to 14.

Because the state is derived rather than stored, changing this reclassifies
existing applications on the next read — the intended behaviour. It also becomes
the Ghost Rate threshold in Phase 3.

---

## C2 · `deemed_pending` — stored or derived

**Resolved** as derived. See
[ADR-0001](../decisions/0001-application-status-model.md).

Noting it here because Application Management.md lists Deemed Pending among the
"supported lifecycle outcomes", which reads as a stored status. It is
implemented as a derived view state instead, so `status` stays an honest record
and analytics does not inherit forgotten updates.

---

## C3 · Match-category vocabulary — RESOLVED

**Conflict.** Three vocabularies for one axis:

| Source | Values |
|---|---|
| PRD user-flow §3 | Perfect Match · Dicey Match · Rejection Pool |
| Backlog JSV2S1052 | Absolute Match · Relative Match / Transferable Skills · No Match |
| Backlog JSV2S1055 | a separate *pre-qualification* classification |

Application Management.md refers to "Dicey Match" when describing referral
signals, which sides with the PRD.

**Resolved 2026-09-04: there were always two axes, not three vocabularies for
one.** That is why the conflict looked irreconcilable — the sources were
describing different questions and using overlapping words for them.

| Axis | Question | Vocabulary | Where |
|---|---|---|---|
| Pre-qualification | Is this worth spending money on? | `pass` · `review` · `reject` | `PREQUALIFICATION_DECISIONS`, ADR-0006 |
| Post-score | How good is it? | `priority_apply` · `apply` · `referral_only` · `reject` | `MATCH_CATEGORIES`, derived by `matchCategoryFor()` |

The first runs before any AI, deterministically, and decides whether a job
becomes an application at all (JSV2S1055). The second is derived from ScoreG's
numeric score afterwards (JSV2S1052). They are not alternatives and never were.

**Superseded:** the PRD's *Perfect Match / Dicey Match / Rejection Pool* — never
implemented, and the PRD user-flow section should no longer be read as
authoritative on this. And JSV2S1052's *Absolute Match / Relative Match / No
Match*, replaced by ScoreG's own bands, which are the ones the prompt actually
produces and the UI already shows.

**Closed by:** Bharath, 2026-09-04 — "the final status based on Job score can
remain intact for now." A check constraint is now possible on both columns;
deliberately not added yet, since the pre-qualification vocabulary should see
real volume before it is frozen in the schema.

---

## C4 · Outreach placement — RESOLVED

**Was.** JSV2S1089–1093 marked **P0** with their own section in
Application Management.md, but absent from the stated MVP pipeline.

**Resolved 2026-08-29: Phase 2.** Outreach lives on the Application board and is
invoked on request, not generated for every application. JSV2S1089–1093 moved
from Deferred to Phase 2 / Not Started.

**Design note for when it is built.** Unlike referral — which is columns on
`applications` because there is at most one per application — outreach needs its
own table: JSV2S1090 asks for outreach history, so there are many messages per
application.

*Correction 2026-09-03:* an earlier version of this note claimed the timeline
event types `outreach_generated` and `outreach_sent` were "already reserved in
`lib/config/constants.ts`". They are not — `EVENT_TYPES` contains only
`application_created`, `status_changed`, `document_generated`,
`referral_updated`, `attempt_created` and `note_added`. They must be added when
outreach is built.

---

## C5 · Table count

**Resolved.** The specified four tables could not carry the P0 scope; six were
built. See [ADR-0003](../decisions/0003-data-model.md).

---

## Verify before relying on

- **Supabase free tier** — project pause on inactivity, storage and row limits.
  Check at signup rather than trusting a remembered figure.
- **`exceljs`** — currently carries a transitive moderate `uuid` advisory
  (bounds check in v3/v5/v6 when `buf` is supplied). Not the prototype-pollution
  class that made SheetJS `xlsx` unattractive, and we parse only your own files.
  Re-check before pinning. CSV + JSON alone would satisfy Phase 1 if it becomes
  a problem.
