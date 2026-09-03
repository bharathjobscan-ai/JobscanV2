# Project management changelog

Version history for the PRD, the product backlog and the execution tracker.
Newest first. Each entry records what changed and why.

Artifacts are versioned **together** under one release number, so a given
version of the PRD always corresponds to a known state of the backlog.

---

## v1.7 — 2026-09-04 — Deterministic pre-qualification gate

### The gate

Four rule-based filters between ingestion and application creation: role,
domain, experience, location. Each returns PASS, FAIL or UNKNOWN; any FAIL
rejects, all PASS qualifies, anything else waits in a review queue. No AI, no
network, no embeddings — the same job and config always produce the same
verdict.

It exists as a **cost control**. Phase 1.5 auto-scores anything without a score,
so without a gate the first scheduled LinkedIn run would bill a Gemini call for
every job it found.

### Corrections to the source requirement

The requirement document was reviewed before implementation; four things in it
would have misfired on a real feed:

- **`Visa` was a Tier-1 payments keyword.** It means the card network there —
  but this application exists to find visa *sponsorship*, so "we offer visa
  sponsorship" would have scored a core-payments signal on a large share of the
  jobs we deliberately search for. Now a restricted term requiring payments
  corroboration and blocked near sponsorship wording.
- **Portugal was missing** from the target countries while Lisboa was a
  preferred city, so a Lisbon job would have been rejected outright. Estonia,
  Lithuania, Luxembourg and Malta were also absent — most of the European EMI
  licensing map.
- **The documented case "Senior PM - Fraud & Risk → PASS" could not pass.**
  Every fraud keyword was a two-word phrase the title does not contain.
- **Over-qualification was invisible.** "Associate Product Manager" contains
  "Product Manager", and a JD asking "2+ years" set a bar a 9-year candidate
  clears, so junior roles passed both filters. `acceptable_min` had been
  declared in the config and never used by any rule; it is now a floor.

Also written from scratch: a **JD section splitter**. The requirement's whole
domain-weighting design assumed `responsibilities`, `requirements` and
`nice_to_have` were separate fields. They are not — `raw_jobs.description` is
one blob — so every section weight was inert until something split it.

### Scoring rule, previously undefined

Each section contributes its weight **once**, multiplied by the best tier
matched in it (Tier 1 × 1.0, Tier 2 × 0.6, Tier 3 × 0.3). Counting once stops a
keyword-stuffed JD outscoring a genuinely on-domain one; tier multiplication is
what makes the config's `priority` field do anything.

### C3 closed — the conflicts page is empty

There were always **two axes**, not three vocabularies for one, which is why it
looked irreconcilable. Pre-qualification (`pass`/`review`/`reject`) answers "is
this worth spending money on?"; `MATCH_CATEGORIES` answers "how good is it?"
after ScoreG runs. The PRD's Perfect/Dicey/Rejection Pool and JSV2S1052's
Absolute/Relative/No Match are both superseded.

### Two landmines in the test suite, found the hard way

Applying the migrations and running `npm run test:integration` on 2026-09-04
**destroyed a live scored application and billed a real API call.** Both were
pre-existing since the Phase 1 commit; neither was introduced by this work.

- **`tests/fixtures/sample-jobs.csv` named real employers** — Revolut, Adyen,
  Stripe, **Wise**, Klarna, Monzo, Airwallex, Checkout.com, Mollie — and
  `cleanup()` deletes `raw_jobs` by company name in both `beforeAll` and
  `afterAll`, cascading through applications, events, attempts and documents.
  The file's own comment claimed the cleanup was "safe to run against a database
  that already holds real applications". It was safe only if you never applied
  to a company the fixture named. The scored Wise application was deleted.
  Fixed: fixture companies are now fictional and suffixed `QA`, every fixture
  URL is on `https://fixture.jobscan.invalid/`, and the cleanup requires both.
- **`gemini-benchmark.itest.ts` sets `AI_PROVIDER=live` and bills a full
  scoring run.** Its header says it is "deliberately not part of `npm test`" —
  true, but nobody excluded it from `test:integration`, whose glob matched it.
  Fixed: the paid files are excluded from the default run and execute only when
  named, via `npm run ai:bench` and `npm run ai:models`.

Also added `npm run prequalify:backfill`, which gives a verdict to jobs ingested
before the gate existed. It never creates, deletes or alters an application:
gating is a decision already made for a promoted job, but the verdict record is
informational and drives the preferred-city highlight.

### Also

ADR-0006 records the gate and the D1 amendment. Migration `0006` adds four
pre-qualification columns plus `content_hash` to `raw_jobs`, which finally wires
JSV2S1040. Review queue at `/review` with promote, reject and a re-run for
verdicts made under an older config. Preferred cities (JSV2S1138) highlighted
across the list, queue and workspace. 51 new unit tests.

**Phase 1.5: 38 stories — 17 Review, 13 Ready, 8 Blocked.**

---

## v1.6 — 2026-09-03 — Provider APIs replace the worker; Phase 1.5 scoped

### Decision: direct provider APIs, routed per task

The local Claude Code worker chosen in ADR-0002 was retired on 2026-09-02
(commit `7b67664`). [ADR-0005](../docs/decisions/0005-provider-apis.md) records
the replacement and supersedes ADR-0002.

**Why it failed**, worst first: it blocked Vercel deployment entirely — the whole
async design existed only because Vercel cannot spawn Claude Code, which made
ADR-0004's hosting decision unreachable; nothing generated while the Mac was off;
scoring quality was capped by what one model could establish; and the
consumer-terms grey area does not survive a scheduled daily run.

**What the APIs fixed.** Gemini's Google Search grounding resolved a UK
sponsor-register entry three consecutive Claude Code runs could not. Anthropic's
prompt caching makes the repeated ~5k-token skill prefix nearly free after the
first call. Both report real token counts, so cost is measured rather than
inferred from harness overhead. Generation is synchronous — the user gets a
result instead of a queued row.

**Removed:** `workers/ai/run.mjs`, `npm run worker`, the polling loop, the
`claude_local` provider value.

**Repurposed:** `ai_jobs` is now the **run ledger**, not a work queue — one row
per call carrying prompt, model, raw result and measured usage. Its
`queued`/`running` statuses, `attempts` column and `ai_jobs_status_queued_idx`
are debris; JSV2S1136 must revive or remove them.

**Unchanged:** `settleAiJobs` is still the single write path from AI output to
documents, score and events.

### Cost is now real money

v1.1–v1.5 figures were projections of what a metered API *would* cost. They are
the bill: ~$0.07–0.09 per grounded score, grounding being the dominant line.
The binding constraint moved from Pro quota to spend, which scales with volume —
and Phase 1.5 puts volume on a cron.

"Zero-cost" restated in the PRD and `AGENTS.md`: it means **no paid
infrastructure**. Metered AI calls and a Phase 1.5 Apify actor are accepted
deliberately and tracked.

### Phase 1.5 scoped

37 stories marked `Phase 1.5` in the backlog — **25 `Ready`, 12 `Blocked`** on a
decision. Seven workstreams: scheduled LinkedIn ingestion via Apify, cleansing,
pre-qualification, automated scoring, digest mailer, mandatory SimG, and
per-application cost visibility.

Three boundaries: **scoring is automated, document generation is not**;
execution is **GitHub Actions**, not Vercel; pre-qualification sits **between**
`raw_jobs` and `applications`, changing the D1 rule.

**Out, deliberately:** the multi-source adapter framework (one source does not
justify a registry and mapping config), other job boards, career-site watchers,
and Application Analytics — its metrics are ratios over outcomes that take months
to accrue, and `application_events` has been capturing the input since Phase 1.

Added **JSV2S1136** (pipeline orchestration — no existing story owned the
automation) and **JSV2S1137** (spend ceiling — proposed, pending a decision).

### Prompt defect fixed

A single shared `OUTPUT_CONTRACT` was appended to every task, so the scoring
prompt instructed the model to emit `<<<CV>>>` and a cover letter. Gemini
complied and buried a full resume inside a score report. Split into
`SCORE_CONTRACT` and `DOCUMENT_CONTRACT`, selected by task type; this also
cleared a contradiction where `summary` was specified as both a string and an
object in the same contract. Regression test in `tests/unit/prompts.test.ts`.

### Documentation reconciled

ADR-0002 marked superseded; ADR-0005 added. PRD §2, §3, §9.4, §9.5, §9.7, §10
and §12 rewritten. `AGENTS.md` rules corrected — three described a worker that no
longer exists — and a standing rule added that documentation is updated in the
same change as the behaviour. `docs/architecture/overview.md` rewritten.
`TASKBOARD.md` rebuilt against the tracker. Corrected in `open-decisions.md`:
C3's "current state" (the code uses ScoreG bands, not the PRD trio) and C4's
claim that two outreach event types were already reserved in `constants.ts` —
they are not.

---

## v1.5 — 2026-08-29 — CVG skill decoupled from document generation

Now that layout lives in `lib/documents/`, the skill no longer carries file or
typography instructions.

### Removed from `prompts/cvg/SKILL.md`

- The `/mnt/skills/public/docx/SKILL.md` and `present_files` instructions —
  neither exists in the worker, so Claude was being told to reach for tooling
  that isn't there.
- Font sizes, margins and filename conventions — all applied deterministically
  by the renderer.
- "Do not output Markdown as the final deliverable" and "always choose DOCX",
  which contradicted the pipeline.
- The reference to an attached `Bharath_Raghu_CV_v4_Final.pdf`, repointed at the
  master resume supplied in the prompt.

### Deliberately kept

- **Strict 1-pager (A4).** This is a content-volume constraint, not a layout
  one. The renderer compresses only to 9pt; deciding *which bullets to cut* is
  the model's judgement and needs the one-page target.
- Condense-before-overflow discipline, standard section headers, single-column
  and no-tables — the last two stop markdown tables the parser would mangle.

### Split out

- `prompts/cvg/SIMG.md` — the Pass 2 adversarial evaluation, ~420 tokens that
  could never fire in this pipeline (it only runs on explicit request) and was
  being sent on every call. Preserved for JSV2S1058 in Phase 2, and usable
  manually today by running it after GenG with the JD and generated documents.

### Code

- `DELIVERY_OVERRIDE` in `lib/ai/prompts.ts` shrinks from ~190 to ~40 tokens.
  With the skill no longer instructing file creation, all it needs to state is
  the heading convention the parser expects.

### Measured effect

Skill 4,181 → 3,733 tokens; override 190 → 40. **~598 input tokens saved per
call, ~1,200 per application.** At Opus 5 input rates that is about $0.006 per
application, roughly $0.36/month at 60 applications — negligible. The real
gains are correctness (no calls to absent tooling) and clarity of instruction.

---

## v1.4 — 2026-08-29 — .docx deliverable

### Decision: documents are rendered, not stored

CV and cover letter are generated as **.docx on download** from the stored
markdown. Nothing is persisted, so storage growth is zero and template fixes
reach every document ever generated.

Chosen over storing binaries because the files are small, regenerating costs
milliseconds, and the alternative adds a bucket, orphaned-file management and no
retroactive fixes. Google Drive / OneDrive was assessed and rejected for Phase 1:
OAuth flow, refresh-token handling and API quota is heavy machinery for a
single-user tool.

**.docx only, not PDF.** It is the format ATS parsers handle most reliably, and
`prompts/cvg/SKILL.md` names DOCX the canonical deliverable. PDF was verified as
technically viable (pdfkit, real text layer) but adds a second renderer for a
format portals accept less reliably.

### Token impact

Claude drafts markdown; the template does layout. Asking the model for formatted
markup instead would cost roughly 3x the output tokens (~1,000 vs ~3,000 per CV)
and drift between runs. Formatting is deterministic work, so it belongs in code.

### Added

- `lib/documents/parse.ts` — markdown to a block structure, with density
  calibration that keeps the CV to one A4 page. Steps font down only as content
  grows and never below 9pt, as the skill requires.
- `lib/documents/docx.ts` — renderer honouring the skill's constraints exactly:
  single column, no tables or text boxes, A4, Calibri, body 10-11pt, bullets
  9.5-10pt, 0.6in margins, no header or footer. Filenames follow the skill's
  convention, `CV_Bharath_Raghu_[Company]_[Role]_[YYYYMMDD].docx`.
- 15 tests covering parsing, density rules, the filename convention, and text
  extraction from the generated .docx as an ATS would perform it.

### Changed

- The download route renders .docx on demand; `?format=md` returns the draft.
  Score reports stay markdown - they are analysis, not an application
  deliverable.
- **Prompt delivery override.** The CVG skill instructs Claude to use a docx
  skill at `/mnt/skills` and a present_files tool, neither of which exists in the
  worker. The prompt now tells Claude to return markdown and states that the
  application renders the .docx under the skill's own constraints. The skill's
  intent is preserved: DOCX canonical, markdown intermediate.

### Backlog

- **Added JSV2S1126** (Phase 2) — review and accept CV/CL recommendations before
  download. Accept wholly or partially, regenerate the markdown revision, then
  persist the .docx to Supabase Storage on download so the submitted file is
  retained.

---

## v1.3 — 2026-08-29 — Backlog additions, docx pipeline removed

### Backlog

- **Added JSV2S1125** (Phase 4) — define instructions to generate a formatted,
  consolidated requirement document on request. Combines the base PRD with
  artifacts from docs, design, architecture, images and markdown, plus the
  changelog. Covers tech arrangements, module architecture, principles, feature
  logic, diagrams, data-flow diagrams, trade-offs, decisions, risks, test cases
  and a user-flow walkthrough. Ad-hoc, not a build step. No tracker subtasks —
  the item has not been picked up.

### Removed

- **The .docx generation pipeline.** `project-management/build/`, the `pm:docs`
  script and `scripts/build-pm-docs.mjs` are gone. The markdown already carries
  the same information, and a consolidated document is now JSV2S1125 territory.

### Documentation

- `project-management/README.md` — states the two levels explicitly: the backlog
  holds product items you define; the tracker holds `-T##` subtasks created only
  once an item is picked up.
- Fixed a misplaced tracker file that an earlier command had nested under
  `backlog/project-management/tracker/`.

### Decisions

- **Pass G is not auto-invoked.** Today it runs only on your confirmation, so the
  MVP treats resume and cover letter generation as a single call without it.
  Making it mandatory is JSV2S1058 in Phase 2.

---

## v1.2 — 2026-08-29 — Open decisions closed, token accounting added

### Decisions

- **C1 resolved: 14 days.** `DEEMED_PENDING_DAYS` default changed from 21 to 14.
  Affects the Pending dashboard view immediately and the future Ghost Rate.
  Because the state is derived rather than stored, the change reclassifies
  existing applications on the next read — which is the intended behaviour.
- **C4 resolved: outreach is Phase 2**, not Phase 1.5. On the Application board,
  invoked on request. JSV2S1089–1093 moved from Deferred to Phase 2 /
  Not Started.

### Added

- **Measured token usage.** `ai_jobs.usage` captures the input, output and cache
  token counts Claude Code reports per run, plus its own cost figure and
  duration. Cost per job is now measured rather than estimated.
- `lib/ai/pricing.ts` — rate table and cost computation, including cache read
  and write multipliers.
- `npm run ai:report` — per-run detail, per-task averages, cost of one fully
  processed application, and projections at daily, weekly and monthly cadence.
- `prompts/EXPORT-GUIDE.md` — exactly what to export from each Claude project,
  under what filename.

### Schema

- Migration `0001_ai_job_usage` adds `ai_jobs.usage` (jsonb, nullable). Additive
  only; no backfill needed.

---

## v1.1 — 2026-08-29 — Phase 1 delivered

Phase 1 (Manual Ingestion + Application Management) built, validated against a
live Supabase database, and pushed.

### PRD

- **Added §9.1** Application status model. Three source documents disagreed on
  naming and on whether `Offer` exists. Resolved to the design-document naming
  with `Offer` restored, because Conversion Rate has no terminal success state
  without it.
- **Added §9.2** `Deemed Pending` is derived, never stored. Prevents the future
  Ghost Rate from inheriting forgotten status updates.
- **Added §9.3** Job-to-application creation rule, distinguishing MVP
  (auto-create, since uploads are pre-filtered externally) from Phase 2
  (create on passing pre-qualification).
- **Added §9.4** AI execution mechanism, with the correction that **Claude Pro
  does not include API access**. Four mechanisms assessed; local Claude Code
  worker chosen. Indicative metered cost recorded for the alternative.
- **Added §9.5** Per-task model selection — Sonnet 5 for scoring, Opus 5 for
  CV and cover letter, both at high effort.
- **Added §9.6** Hosting and access control — Vercel with a single-password gate;
  all database access server-side through Drizzle.
- **Added §10** Data model. Six tables rather than the four originally scoped;
  document storage and an AI queue were required by P0 items.
- **Added §11** Five open conflicts (C1–C5), recorded rather than reconciled.
- **Added §12** Phase boundaries.
- **Clarified §3 and §4** that the existing Claude workflows are project
  instructions, not executable Skills, and must be exported to `/prompts/`.

### Product backlog

- Added `Phase`, `Status` and `Notes` columns to all 124 items.
- **33 items → Completed.** JSV2S1007–1009, 1031–1034, 1036, 1039, 1041,
  1047–1048, 1061, 1074–1088, 1094–1098.
- **5 items → Deferred.** JSV2S1089–1093 (outreach), pending C4.
- Remaining 86 assigned to Phase 2 or Phase 3.
- Recorded that several Phase 2 items already have their foundations in place —
  `raw_jobs` columns for LinkedIn extraction, retry behaviour in `ai_jobs`,
  row-level failure isolation from the upload path.

### Execution tracker

- Created. 56 subtasks against Phase 1 product items, typed and status-tracked.
- 51 Completed, 3 Blocked (all needing user action), 2 Not Started (Vercel deploy).

### Notable corrections during the build

- `getEnv` treated an empty environment value as present-but-invalid rather than
  unset, so a fresh checkout following the README failed at startup. Caught by
  the new integration suite.
- Switched from `drizzle-kit push` to `drizzle-kit migrate`. The committed
  migration is versioned and reproducible; `push` also requires an interactive
  terminal.
- Documented three Supabase setup facts learned the hard way: the connection
  string moved to the **Connect** button; `DIRECT_URL` should use the session
  pooler because the direct host is IPv6-only on new free projects; and a
  password containing `%` must be percent-encoded or the driver fails with a
  bare `URIError: URI malformed`.

---

## v1.0 — 2026-08 — Baseline

- PRD as originally written: vision, principles, subscriptions, journey so far,
  journey ahead, high-level user flow, tech and infra architecture, project
  structure, module architecture.
- Product backlog as originally written: 124 items, JSV2S1001–JSV2S1124, with
  Layer, Module, Epic, Story, Task and Description. Priority set to P0 on the
  23 Application Management items; blank elsewhere. No status tracking.
- Application Management and Application Analytics design documents.
- No execution tracker.
