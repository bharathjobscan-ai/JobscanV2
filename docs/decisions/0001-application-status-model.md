# ADR-0001 — Application status model

**Status:** Accepted · **Date:** 2026-08-29 · **Backlog:** JSV2S1082–1085

## Context

The three source documents disagreed on the application lifecycle.

| | PRD | Application Management.md | Backlog JSV2S1083 |
|---|---|---|---|
| Post-application rejection | `Rejected – Shortlist` | `Rejected – Application` | `Rejected – Application` |
| No response | `Deemed Rejected` (2 weeks) | `Deemed Pending` | `Deemed Pending` |
| Success | `Offer` | *absent* | *absent* |
| Pre-application | *absent* | `Ready to Apply` | *absent* |

## Decision

Adopt the Application Management naming, and restore `offer` from the PRD:

```
ready_to_apply · applied · shortlisted · interview · offer
rejected_application · rejected_screening · rejected_interview · rejected_visa
```

`offer` is restored because Application Analytics §4 defines Conversion Rate as
movement to "the defined successful outcome". Without a terminal success state
the funnel has no end and the metric cannot be computed.

`ready_to_apply` is kept because it is the first dashboard view and the state
every uploaded job lands in.

## `deemed_pending` is derived, never stored

It is **not** in the status enum. It is computed at query time:

```sql
status = 'applied'
  and applied_at is not null
  and applied_at < now() - make_interval(days => DEEMED_PENDING_DAYS)
```

Storing it would require remembering to set it on every application, and the
Phase 3 Ghost Rate would silently inherit whatever was forgotten. Deriving it
keeps `status` an honest record of what actually happened, and gives the Pending
view and the future metric one shared definition.

Implementation: `pendingPredicate()` in `features/applications/queries.ts`.

## Waiting period

The PRD says 2 weeks; Application Analytics §6 says 21 days. Unresolved, so it
is a single config knob — `DEEMED_PENDING_DAYS`, defaulting to **21**. Changing
it is an env edit with no schema impact. Tracked as C1 in
[open-decisions.md](../product/open-decisions.md).

## Views

The five dashboard views partition cleanly rather than overlapping, so counts
add up and future funnel maths stays sane:

| View | Definition |
|---|---|
| Ready to Apply | `ready_to_apply` |
| Applied / Active | `applied · shortlisted · interview`, **excluding** derived-pending |
| Pending | derived-pending |
| Closed | `offer · rejected_*` |
| All | everything |

## Consequences

- Analytics can compute the full funnel from `application_events` without a
  migration.
- Anyone reading `status` sees a fact, not an inference.
- Changing the waiting period retroactively reclassifies the Pending view, which
  is the intended behaviour for a derived state.
