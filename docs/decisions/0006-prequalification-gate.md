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
