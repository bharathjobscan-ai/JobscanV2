# ADR-0006 — Pre-qualification, and the amendment to D1

**Status:** Accepted · **Date:** 2026-09-04
**Backlog:** JSV2S1037, 1038, 1054, 1055, 1056 · **Resolves:** conflict C3

## Context

D1 (PRD §9.3) says every valid job becomes an application immediately. That was
right for Phase 1, where jobs arrived by hand a few at a time and were
pre-filtered by the person uploading them.

Phase 1.5 breaks the assumption twice over. Jobs will arrive from LinkedIn on a
daily schedule, unfiltered and in the hundreds, and JSV2S1136 auto-scores
anything without a score. Under D1 as written, the first scheduled run creates
hundreds of unwanted application rows and bills a Gemini call for each — roughly
$0.07–0.09 per job, against a stated zero-cost-infrastructure constraint.

So the gate is **a cost control first** and a triage convenience second. That
framing decides the arguments below.

## Decision

**A deterministic pre-qualification engine runs between `raw_jobs` insertion and
`applications` creation.** Four filters — role, domain, experience, location —
each returning PASS, FAIL or UNKNOWN. Any FAIL rejects; all PASS qualifies;
anything else needs a human.

> **Amended 2026-09-19.** There are now five filters and a watchlist signal, and
> FAIL rejects on only three of them. See the revision at the end of this file.

No AI, no network, no embeddings. Every decision is a rule you can read, and
every verdict records the rule and the evidence that produced it. A gate you
cannot audit is one you stop trusting and then stop using.

### D1 is amended, not replaced

**Every trigger gates.** A job becomes an application only if it passes.

*Revised 2026-09-04.* The first version of this ADR exempted manual uploads, on
the reasoning that a hand-curated file is a deliberate act and screening rows out
of it would be surprising. That held for a ten-row sheet and failed on contact
with the real use: a one-time Apify backfill of thirty days across eleven cities
arrives through the upload form and is thousands of rows. Exempting it would have
created thousands of applications — the exact flood this gate exists to prevent.

The exemption was also solving a problem that does not exist. A screened-out job
is not discarded: it keeps its `raw_jobs` row, its full verdict, and a place in
the review queue one click from becoming an application.

### `UNKNOWN` never rejects

A posting that does not state its location is not a posting in the wrong place.
Scraped JDs are wildly uneven — missing sections, no experience line, a title in
German — and treating silence as contradiction would discard good jobs for bad
formatting. Those land in REVIEW, where the cost of being wrong is one click
rather than a lost opportunity.

## Consequences

**A `raw_jobs` row can now exist without an application.** `applications.rawJobId`
was already `notNull().unique()` with the comment *"Phase 2 will add raw jobs
that never become applications"*, so the schema anticipated this and needed no
change. Four columns were added to `raw_jobs`: the decision, the full
explainable detail, the timestamp, and the config version.

**Screened-out jobs are invisible to every existing query.** Every read in
`features/applications/queries.ts` is rooted at `applications` with an inner
join, and `countByView` counts `applications` rows. That is why the review queue
is a separate page rooted at `rawJobs` with a left join, and not a sixth tab.

**The config version is load-bearing.** Widening the role list should let
previously-rejected jobs be reconsidered without re-ingesting anything;
`prequalification_version` is what makes them findable (`requalifyStale`).
Without it a rules change silently strands its own history.

**Domain scoring is now duplicated on purpose.** ScoreG still scores domain
itself, and the pre-qual score is deliberately *not* fed into the prompt.
Removing it from the skill is deferred until the gate has been calibrated
against real volume — noted on JSV2S1053 so the redundancy is a decision rather
than an oversight.

## Rejected alternatives

**Rejecting on UNKNOWN.** Simpler, cheaper, and wrong: it converts every badly
formatted posting into a silent loss, and scraped postings are badly formatted
most of the time.

**AI-assisted pre-qualification.** It would classify better. It would also cost
money per job on the exact step whose purpose is to avoid spending money per
job, and would make the gate non-reproducible — the same job could pass on
Tuesday and fail on Wednesday.

**YAML configuration**, as the source requirement suggested. There is no YAML
parser in the project, adding one is a dependency plus a runtime parse-error
surface, and the repo's precedent is TS-as-data with Zod (ADR-0003). TS also
carries comments, which is how *why* `Visa` is restricted survives contact with
the next person editing the keyword list.

## Notes on the source requirement

The PRD this was built from assumed `responsibilities`, `requirements` and
`nice_to_have` were separate fields; they are not, so a JD **section splitter**
had to be written before any section weighting could mean anything. Four of its
keyword and geography rules would have misfired in production — most seriously
`Visa` as a core payments keyword in an application built to find visa
sponsorship, and Portugal missing from the target countries while Lisbon was a
preferred city. Each correction is commented at the point of change in
`config/prequalification/`.

---

## Revision, 2026-09-19 — five filters, one signal, and FAIL no longer always rejects

**Status:** Accepted · **Backlog:** JSV2S1156, 1162, 1165, 1166, 1167, 1168

The gate above has four filters and one rule: any FAIL rejects. Both change.

### A fifth filter: visa language in the JD

A deterministic classifier reads the description for **explicit** sponsorship
language in both directions. It is not an inference engine: the question it
answers is *"does this JD contain sufficiently strong evidence that sponsorship
is unavailable"*, never *"can I find the word visa"*.

Three outcomes, and the asymmetry is the whole design:

| Outcome | Meaning | Gate effect |
|---|---|---|
| `REMOVE` | Explicit refusal, or the role is stated as not sponsorable | Reject |
| `KEEP` | Explicit offer of sponsorship | Pass, recorded |
| `REVIEW` | Conditional, generic, contradictory, or **silent** | Pass, recorded |

**Silence passes.** Most postings in London, Amsterdam and Berlin say nothing
about visas at all, and a filter that read silence as refusal would reject
almost the entire intake — the Axon failure one pillar over. Generic
right-to-work language passes too: "must have the right to work in the UK" is
compatible with a candidate the company can later sponsor.

The cost asymmetry is what sets the threshold. A false REMOVE deletes a genuinely
sponsorable job and we never learn of it. A false REVIEW costs one click. So the
classifier optimises for recall of possible sponsorship, not for tidiness.

This also **retires `mentionsSponsorship()`** in
`features/ingestion/sources/apify-linkedin.ts`, which flags on bare "right to
work" and "work permit" — exactly the generic terms this filter must never act
on. Two sponsorship detectors with opposite thresholds can only disagree.

### A signal, not a sixth filter: the sponsorship watchlist

Companies known to have sponsored international candidates. It is deliberately
**not** a pillar: it can never reject, and a miss is simply no bump. Calling it
a pillar would make "all pillars passed" mean something different from what it
means for the other five.

It is the third company list and answers a third question. Keeping them apart
is what stops each from being quietly wrong:

| List | Question | Source |
|---|---|---|
| Sponsor register | Holds a licence today? | UK register, refreshed on schedule |
| **Watchlist** | **Has actually sponsored?** | **Curated, append-only** |
| **Payments-core** | **Is payments their core business?** | **Curated, ~25 names** |

The watchlist is append-only: a company is added when sponsorship is confirmed,
never removed on absence of evidence. Because a watchlist miss does not block
conversion to an application, off-list companies keep being applied to, so the
list can still learn rather than ossifying around what it already contains.

### FAIL no longer always rejects

The original rule was uniform because four filters of equal confidence made it
uniform. With five filters of unequal confidence it over-rejects.

| Filter | FAIL | UNKNOWN |
|---|---|---|
| Domain | **Reject** | Review |
| Visa language (`REMOVE`) | **Reject** | Review |
| Location, recognised non-target country | **Reject** | Review |
| Location, unrecognised | — | Review |
| Role / title | Review | Review |
| Experience | Review | Review |

Role and experience are the arguable ones — a title reads senior but states no
years, a range is open-ended — and the Axon rejection was exactly this shape.
Location is not arguable in the same way: a recognised non-target country is a
confident fact, and sending every Texas posting to review would flood the queue
the gate exists to keep small.

### Domain FAIL is softened by the payments-core list

Domain is the one straight-reject pillar, and it reads keywords from the JD. A
generic "Senior Product Manager" posting at Adyen or Checkout.com frequently
contains no payments vocabulary at all, because there it goes without saying —
so domain-first rejects roles at the highest-priority companies.

The list has two tiers, along the line ScoreG already draws between a company
whose core business *is* payments (+10) and one with a significant payments arm
(+5), because a domain miss means something different at each:

| Tier | Domain FAIL | Why |
|---|---|---|
| A — payments is the business | **Passes, marked** | A miss is the rare exception; the role is almost certainly payments-adjacent and an application is the better default |
| B — significant payments arm | **Review** | A miss is the normal case — a large marketplace posts far more unrelated PM roles than payments ones |

A Tier A pass is recorded like any other verdict, under its own rule
(`DOMAIN_UNEVIDENCED_COMPANY_AFFINITY`) with the company as its evidence, so
every application admitted this way can be found and the rule audited against
what it actually let through.

**The override is scoped to the domain filter, not to the gate.** An Adyen
posting in Texas still rejects on location, and one asking for fifteen years
still routes to review on experience. A whole-gate bypass would be the
short-circuit this ADR already refuses elsewhere.

### Passing the gate no longer triggers a score

A job that passes all five filters **and** hits the watchlist is not scored
automatically. Its match category is the enum `gate_qualified`, and ScoreG runs
only when asked, from a button.

Not a flat number, and not a blank. `matchCategoryFor` derives the band as a
pure function of the score, so stamping a placeholder like 80 would manufacture
an "Apply" verdict and a referral recommendation out of a number nobody
calculated, then sort it against real scores and average it into spend
reporting. The enum cannot be arithmetic'd by accident.

The pattern is already in the skill — *"Source = Recruiter Inbound → skip
scoring entirely, auto-classify as PRIORITY"* — and note what it assigns: a
category, never a score.

**The gate does not compute a substitute score.** Measured against
`prompts/scoreg/SKILL.md`, roughly 30 of the final 100 points are not derivable
in code at all — Functional PM Match (30 raw points of the resume pillar) is
semantic extraction from free text, and company size, reachability and
community sentiment are not facts we hold. A deterministic number claiming to be
a ScoreG score would be a second instrument reporting one quantity, which is the
anomaly we already removed from CVG.

### What did not change

No AI, no network, no embeddings in `features/prequalification/`. Every new
rule is readable, every verdict still records the rule and the evidence. The
visa classifier stores the matched sentence, not just its verdict.
