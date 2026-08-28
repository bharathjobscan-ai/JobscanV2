# Open product decisions

Conflicts found across the PRD, the Product Backlog, Application Management.md
and Application Analytics.md. Recorded rather than silently reconciled.

Resolved items are in [docs/decisions/](../decisions/).

---

## C1 · Waiting period before an application reads as Pending

**Conflict.** PRD (p2): "Deemed Rejected (after 2 weeks of no response)".
Application Analytics §6: "a defined waiting period of **21 days**".

**Current state.** Single config knob `DEEMED_PENDING_DAYS`, default **21**.
No schema impact; changing it is an env edit.

**Needs.** Your confirmation of 14 or 21. Also drives the future Ghost Rate.

---

## C2 · `deemed_pending` — stored or derived

**Resolved** as derived. See
[ADR-0001](../decisions/0001-application-status-model.md).

Noting it here because Application Management.md lists Deemed Pending among the
"supported lifecycle outcomes", which reads as a stored status. It is
implemented as a derived view state instead, so `status` stays an honest record
and analytics does not inherit forgotten updates.

---

## C3 · Match-category vocabulary

**Conflict.** Three vocabularies for one axis:

| Source | Values |
|---|---|
| PRD user-flow §3 | Perfect Match · Dicey Match · Rejection Pool |
| Backlog JSV2S1052 | Absolute Match · Relative Match / Transferable Skills · No Match |
| Backlog JSV2S1055 | a separate *pre-qualification* classification |

Application Management.md refers to "Dicey Match" when describing referral
signals, which sides with the PRD.

**Current state.** `match_category` is a free-text column; the PRD trio is the
UI vocabulary in `lib/config/constants.ts`.

**Needs.** JSV2S1052, JSV2S1054 and JSV2S1055 are all still open backlog items.
Freeze the vocabulary when ScoreG is finalised, then consider a check
constraint.

---

## C4 · Outreach is P0 in the backlog but absent from the MVP pipeline

**Conflict.** JSV2S1089–1093 are marked **P0** and Application Management.md
gives Outreach its own section. The stated MVP pipeline (manual ingestion →
dashboard → workspace → on-demand generation → tracking) does not mention it.

**Current state.** Deferred to Phase 1.5. No outreach table exists.

**Needs.** Confirmation that deferring a P0 is intended. If outreach comes back
into Phase 1, it needs its own table — unlike referral, there are many messages
per application (JSV2S1090 asks for outreach history).

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
