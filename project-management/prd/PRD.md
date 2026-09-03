# JobScan V2 — Product Requirements Document

**Current version:** 1.7 · **Last updated:** 2026-09-04 · **Owner:** Bharath Raghu

---

## Document control

**Version 1.7 — 2026-09-04 — Deterministic pre-qualification; C3 closed**

- **A deterministic pre-qualification gate now sits between `raw_jobs` and
  `applications`** (§9.3, [ADR-0006](../../docs/decisions/0006-prequalification-gate.md)).
  Four rule-based filters — role, domain, experience, location — each returning
  PASS, FAIL or UNKNOWN. Any FAIL rejects, all PASS qualifies, anything else
  goes to a review queue. No AI, no network, fully reproducible.
- **D1 is amended, not replaced.** Manual uploads are evaluated but never gated;
  scheduled ingestion creates an application only on PASS. The gate exists to
  stop an unattended run billing a scoring call for every job it finds.
- **C3 is resolved, and the page of open conflicts is now empty** (§11). There
  were always two axes rather than three vocabularies for one: pre-qualification
  (`pass`/`review`/`reject`) and post-score (`MATCH_CATEGORIES`). The PRD's own
  Perfect/Dicey/Rejection Pool wording is superseded.
- **Four defects in the source requirement were corrected before building.**
  `Visa` was a Tier-1 payments keyword in a product that searches for visa
  sponsorship; Portugal was missing while Lisbon was a preferred city; the
  documented "Fraud & Risk → PASS" case could not pass; and an Associate PM role
  passed both role and experience because `acceptable_min` was declared and
  never used.
- Added JSV2S1138 (preferred cities). Phase 1.5 is now 38 stories: 17 Review,
  13 Ready, 8 Blocked.

**Version 1.6 — 2026-09-03 — Provider APIs replace the worker; Phase 1.5 scoped**

- **AI execution migrated from a local Claude Code worker to direct provider
  APIs** (§9.4, [ADR-0005](../../docs/decisions/0005-provider-apis.md),
  superseding ADR-0002). There is no queue, no worker and no polling; generation
  is synchronous. This unblocked Vercel deployment, which the worker design had
  made unreachable.
- **Execution is routed per task, measured rather than assumed** (§9.5). Gemini
  with Google Search grounding scores; Claude writes documents. Gemini resolved a
  UK sponsor-register entry that three Claude Code runs could not; Claude's prompt
  caching makes the repeated skill prefix nearly free on the document path.
- **Cost became real** (§9.7). The v1.1–v1.5 figures were projections of what a
  metered API *would* cost. They are now the bill: ~$0.07–0.09 per grounded score.
- **Phase 1.5 defined** (§12): scheduled LinkedIn ingestion, cleansing,
  pre-qualification, automated scoring, digest mailer, mandatory SimG and
  per-application cost visibility. 37 stories; 25 ready, 12 awaiting a decision.
  Document generation stays manual by decision.
- **"Zero-cost" restated honestly** (§2). It means no paid *infrastructure*.
  Metered AI calls and a Phase 1.5 Apify actor are accepted and tracked.
- Added JSV2S1136 (pipeline orchestration) and JSV2S1137 (AI spend ceiling).
- Fixed a prompt defect: one shared output contract was instructing the scoring
  model to also produce a CV and cover letter. Score and document contracts are
  now separate (§9.8).

**Version 1.5 — 2026-08-29 — Skill decoupled from document generation**

- The CVG skill no longer carries file-generation or typography instructions;
  those live in `lib/documents/`. Content constraints stay with the model — the
  strict one-page target in particular, which governs how much it writes and
  cannot be compensated for by the renderer.
- SimG (Pass 2) split into `prompts/cvg/SIMG.md` so it is not sent on every
  generation call. Automatic invocation remains JSV2S1058 (Phase 2).

**Version 1.4 — 2026-08-29 — Document deliverable format**

- CV and cover letter are delivered as **.docx**, rendered on download from the
  stored markdown. Nothing is persisted: storage growth is zero and template
  fixes reach every document already generated.
- .docx over PDF because it is the format ATS parsers handle most reliably, and
  the CVG skill names DOCX the canonical deliverable.
- Layout lives in application code, not in the model's output. Asking Claude for
  formatted markup would cost roughly 3x the output tokens and drift between
  runs; formatting is deterministic work.
- Added JSV2S1126 (Phase 2): accept recommendations before download, then persist
  the .docx to Supabase Storage.

**Version 1.3 — 2026-08-29 — Pass G scope clarified**

- Pass G (adversarial validation of CV optimiser output) is **not** auto-invoked
  in the MVP. It runs today only on explicit confirmation, so resume and cover
  letter generation is a single call. Making it mandatory requires updating the
  CVG skill and is tracked as JSV2S1058 in Phase 2. This lowers the measured
  per-package token cost relative to the v1.1 estimate.
- Added JSV2S1125 (Phase 4): consolidated requirement document generation on
  request.

**Version 1.2 — 2026-08-29 — Open decisions closed**

- **C1 resolved.** The waiting period before an application reads as Deemed
  Pending is **14 days**, per this PRD's original "2 weeks". The Application
  Analytics document's 21 days is superseded.
- **C4 resolved.** Outreach moves to **Phase 2**, not Phase 1.5. It lives on the
  Application board and is invoked on request rather than generated for every
  application.
- **Added §9.7** Token accounting. Usage is measured per run from Claude Code's
  own reporting rather than estimated, and stored against each job.

**Version 1.1 — 2026-08-29 — Phase 1 delivered**

Added, following the Phase 1 build of Manual Ingestion and Application Management:

- Application status model resolved and frozen (§9.1). Three source documents
  disagreed; `Offer` restored, design-document naming adopted.
- `Deemed Pending` redefined as a derived state rather than a stored status (§9.2).
- Job-to-application creation rule stated for MVP and Phase 2 (§9.3).
- AI execution mechanism decided and costed (§9.4). Claude Pro does not include
  API access; a local Claude Code worker executes against the subscription.
- Model selection per task recorded (§9.5).
- Hosting and access control decided (§9.6).
- Data model documented (§10) — six tables, not the four originally scoped.
- Five open conflicts recorded rather than silently reconciled (§11).
- Phase boundaries restated (§12).

**Version 1.0 — 2026-08 — Initial PRD**

Original document covering vision, principles, journey so far, journey ahead,
high-level user flow, tech and infra architecture, project structure and module
architecture.

---

## 1. Vision

JobScan is an AI-powered platform that finds Product Management jobs with visa
sponsorship. Every day it fetches jobs from multiple sources, scores them based
on sponsorship likelihood and relevance, and generates customised CVs, cover
letters and application tracking.

## 2. Product principles

1. **Modularity** — every module must function standalone and compose with others.
2. **Low-cost infra** — build with free-tier tools where possible.
3. **Privacy-first** — all data belongs to the user.
4. **Iteration over perfection** — each module can evolve independently.

**Clarification added in v1.6.** "Low-cost" means **no paid infrastructure** — no
containers, queue services, Redis or paid hosting. It does not mean zero spend:
metered AI calls (§9.4) and, from Phase 1.5, an Apify actor are accepted
deliberately and tracked per run. Stated here because earlier versions read as
zero-cost absolutely, and that is no longer true.

## 3. Available subscriptions

- Google AI Pro
- Claude Pro
- Apify LinkedIn Job Scraper Actor, if required

**Clarification added in v1.1:** Claude Pro does **not** include Anthropic API
access. They are separate products with separate billing. See §9.4.

**Updated in v1.6.** Neither subscription drives the product any more. Execution
runs on **separately billed API keys** — `GEMINI_API_KEY` and
`ANTHROPIC_API_KEY` — not on the Pro plans. The subscriptions remain useful for
authoring prompts and for development; they are not part of the runtime.

## 4. Journey so far

Existing reusable workflows, held as Claude projects:

1. **Job scorer** — evaluates an opportunity and assigns a score across visa,
   domain and relevance.
2. **Company profile** — generates a two-page report per company on shortlist.
3. **CV optimiser** — tailors the resume per JD, runs an ATS format check, calls
   out domain gaps, produces a one-page CV and cover letter, and applies an
   adversarial validation pass.
4. **Message generator** — curated mail/message to recruiter, referrer or hiring
   manager.
5. **Technical interview preparation** — generates a chaptered PDF book from a
   subject and the gaps to be covered.
6. **Case study preparation** — trains against a one-time generated frameworks book.
7. **Application tracker** — a Google Sheet. No analytics.

**Clarification added in v1.1:** these are Claude project instructions plus
attachments. They are **not** executable Claude Skills and cannot be invoked
from an application runtime as-is. To be used by JobScan they must be exported
into `/prompts/<skill>/` as markdown.

## 5. Journey ahead

### 5.1 Job ingestion

Auto-fetch jobs across recognised portals, apply pre-qualification filters
(location, role, domain, relevance) and populate the dashboard. Provide a back
door to upload jobs manually via spreadsheet.

### 5.2 Application management

A unified dashboard of all applicable jobs. Each job becomes an application with:

- **Resume** — CV and CL customised for the role, ready to download
- **Job score** — post-qualification score plus analysis
- **Application status** — see §9.1 for the resolved model
- **Referral** — referral status for the role
- **Outreach** — custom messages from predefined formats, sent via LinkedIn/Gmail
- **Application attempt** — a fresh application to an already-applied job,
  sometimes from a new email address, sometimes produces a shortlist

### 5.3 Application analytics

Total applications, awaiting response, shortlist rate, interview rate, rejection
rate (post-interview, post-screening, post-application), ghost rate, conversion
rate. Filters for geography, dates and referral.

## 6. High-level user flow

1. **Discover and ingest** — fetch periodically across job boards, verified
   company career sites and manual uploads.
2. **Pre-qualification** — deterministic filters for role, domain, experience,
   location, freshness and duplicates.
3. **Job scoring and categorisation** — deep-score qualified jobs and classify
   them, with referral requirements flagged.
4. **Material generation** — tailored resumes, cover letters and gap analysis for
   high-potential jobs. Outreach, referral and technical-prep material on request.
5. **Daily notification** — top 10 jobs per country with key signals.
6. **Dashboard and action** — review, examine analysis, apply, request a referral,
   generate material, or reject.

## 7. Tech and infra architecture

- **Frontend** — Next.js + React + Tailwind. ₹0
- **Backend** — Next.js Route Handlers / Server Actions. ₹0
- **Database** — Supabase PostgreSQL free tier. ₹0
- **ORM** — Drizzle. ₹0
- **AI** — existing Claude workflows. Existing subscription
- **AI review** — Gemini + Antigravity, development layer only. Existing subscription
- **Job extraction** — Apify for LinkedIn and difficult sources. API usage
- **Scheduler / background jobs** — GitHub Actions. No Redis, Celery or queues. ₹0
- **File storage** — Supabase Storage. ₹0 within free limits
- **PDF** — no PDF library initially; introduce one only on measurable need. ₹0
- **Git / CI** — GitHub. ₹0
- **Hosting** — Vercel. ₹0

## 8. Module architecture

1. **Ingestion** — fetcher, watcher, upload, pre-qualification filters, notification
2. **Intelligence** — scoring, available as existing capability
3. **Optimization** — CV optimiser, available as existing capability
4. **Applications** — application management
5. **Preparation** — technical and case-study interview prep
6. **Insights** — application analytics

---

## 9. Decisions (added in v1.1)

### 9.1 Application status model

The PRD, the Application Management design document and backlog item JSV2S1083
disagreed. Resolved as follows.

Adopted statuses: `Ready to Apply`, `Applied`, `Shortlisted`, `Interview`,
`Offer`, `Rejected — Application`, `Rejected — Screening`,
`Rejected — Interview`, `Rejected — Visa`.

Rationale: the design document's naming is adopted, because the backlog agrees
with it. `Offer` is restored from PRD v1.0 because Application Analytics defines
Conversion Rate as movement to a successful outcome — without a terminal success
state the funnel has no end.

`Ready to Apply` is retained as the first dashboard view and the state every
uploaded job enters.

### 9.2 Deemed Pending is derived, not stored

`Deemed Pending` is **not** a stored status. It is computed at read time as: the
application was submitted, never progressed past `Applied`, and the waiting
period has elapsed.

Rationale: storing it would require remembering to set it on every application,
and the Ghost Rate metric would inherit whatever was forgotten. Deriving it keeps
the stored status an honest record of what actually happened, and gives the
Pending dashboard view and the future Ghost Rate one shared definition.

### 9.3 Job to application creation

**Amended in v1.7 — see [ADR-0006](../../docs/decisions/0006-prequalification-gate.md).**

Creation is now conditional on the ingestion trigger:

| Trigger | Behaviour |
|---|---|
| Manual upload | Verdict recorded, application **always** created |
| Scheduled | Verdict recorded, application created **only on PASS** |

A file uploaded by hand is a deliberate act, and silently discarding rows from
it would be surprising. Unattended ingestion is where the volume and the cost
are, so that is where the gate bites.

A screened-out job keeps its `raw_jobs` row with the full verdict and waits in
the review queue, where one click promotes it. Nothing is deleted, and the gate
is overridable by design — it is a cost control, not an authority.

### 9.4 AI execution mechanism (rewritten in v1.6)

**Decision: call the Gemini and Anthropic APIs directly and synchronously,
routed per task, behind the existing `AiProvider` interface.** A fixture-based
`mock` driver remains the default, so the whole app builds and tests with no
spend. See [ADR-0005](../../docs/decisions/0005-provider-apis.md).

**What this replaced.** v1.1–v1.5 specified a local Claude Code worker driving
the Claude Pro subscription, with an `ai_jobs` queue between app and worker
because Vercel cannot spawn Claude Code. That design was retired on 2026-09-02
for four reasons, in order of severity:

1. **It blocked deployment.** The asynchronous machinery existed solely to work
   around Vercel's inability to run Claude Code — meaning the hosting decision in
   §9.6 could not actually be executed.
2. **Nothing generated while the Mac was off.** Named as an accepted risk in
   v1.1; in practice it makes the tool untrustworthy.
3. **Scoring quality was capped.** Gemini's Google Search grounding resolved a UK
   sponsor-register entry that three consecutive Claude Code runs could not.
4. **The consumer-terms grey area never resolved,** and does not survive a
   scheduled daily run.

**There is now no queue, no worker and no polling.** `ai_jobs` survived, but its
purpose changed: it is the **run ledger**, one row per call carrying the prompt,
model, raw result and measured token usage. `settleAiJobs` remains the single
write path from AI output to documents, score and events.

**Claude Pro still does not include Anthropic API access.** That fact is
unchanged; what changed is that the API is now paid for rather than routed around.

### 9.5 Model selection (rewritten in v1.6)

Routing is **per task**, because the providers were measured to differ on the
axes that matter — not assumed to:

| Task | Provider | Model | Why |
|---|---|---|---|
| Job scoring | Gemini | `gemini-3.1-pro-preview` | Google Search grounding resolves sponsorship evidence, which is 50% of the score |
| Resume + cover letter | Anthropic | `claude-opus-5` | Long-form quality; prompt caching makes the ~5k-token skill prefix nearly free after the first call |

Both sides stay configurable per task (`PROVIDER_SCORING`, `PROVIDER_CV`,
`MODEL_*`), so re-routing is an environment change, not a code change.
`npm run ai:bench` compares providers on the same job, so this stays
evidence-based as models change.

**Pass G.** Still not auto-invoked; resume and cover letter are produced by a
single call. Making it mandatory is JSV2S1058, moved into **Phase 1.5**. Its own
decision rule caps rewrites at one, so the cost is bounded at two extra calls per
package. Because Phase 1.5 keeps document generation manual, this does not
compound with the scheduled run.

### 9.6 Hosting and access control

Vercel free tier with Supabase free Postgres. Access is gated by a single shared
password enforced in the Next.js proxy; the session cookie stores a hash rather
than the password. Supabase Auth is deliberately not used — single user, no
sign-up, no roles.

All database access is server-side through Drizzle. `supabase-js` is not used for
data access, so Supabase keys never reach the browser.

### 9.8 Document generation (added in v1.4)

Claude drafts the CV and cover letter as markdown. The application renders the
final **.docx** in `lib/documents/`, applying the constraints in
`prompts/cvg/SKILL.md` exactly: single column, no tables or text boxes, A4,
Calibri, body 10-11pt, bullets 9.5-10pt calibrated to hold one page, 0.6in
margins, no header or footer.

Rendering happens **on download**; no binary is stored. Storage growth is zero,
and a template improvement applies retroactively to every document already
generated.

The skill targets Claude.ai, where a docx skill and a file-presentation tool
exist. Neither exists in the worker, so the prompt carries a delivery override
telling Claude to return markdown. The skill's intent is unchanged: DOCX is the
canonical deliverable, markdown the drafting stage.

Persisting the produced file to Supabase Storage, after a review-and-accept
step, is JSV2S1126 in Phase 2.

### 9.7 Token accounting (added in v1.2, rewritten in v1.6)

Token usage is **measured, not estimated**. Each provider reports its own counts
and they are normalised onto one basis — reasoning tokens folded into output, so
providers compare like with like — then stored on the run in `ai_jobs.usage`.
`npm run ai:report` summarises runs, averages per task and projects cadences.

**These are now billed figures, not projections.** Under v1.5 nothing was
charged and the numbers answered "what would this cost on a metered API". Since
§9.4 changed, they are the bill. Measured: roughly **$0.07–0.09 per grounded
score**, with Google Search grounding the dominant line item.

The binding constraint moved with it. It was Pro quota, shared with development
sessions; it is now money, scaling with volume. Phase 1.5 puts volume on a
schedule, which is why JSV2S1132 (per-application cost, in the workspace) is
sequenced *before* automation, and why JSV2S1137 proposes a spend ceiling.

JSV2S1127 (local UK sponsor register) is partly a cost measure: a deterministic
lookup removes search grounding from the visa pillar.

---

## 10. Data model (added in v1.1)

Six tables. The Phase 1 scope originally specified four; document storage and an
AI work queue were both required by P0 backlog items.

1. **raw_jobs** — the canonical job record, source-agnostic so Phase 2 adapters
   write to it unchanged. Holds the original payload verbatim, a schema version,
   and first/last seen timestamps.
2. **applications** — the workspace record. One per job in Phase 1. Referral is
   held here as columns, since there is at most one referral per application.
3. **application_attempts** — one row per distinct try, each with its own channel,
   email address, outcome and notes.
4. **application_events** — append-only. Serves both status history and the
   activity timeline; two tables would mean two versions of the same truth.
5. **application_documents** — versioned resumes, cover letters and score reports.
   Content is markdown held in the database, so no file storage is needed yet.
6. **ai_jobs** — the run ledger: one row per AI call, holding the prompt, the
   model, the raw result and measured token usage. It was the worker's queue
   until v1.6; the table outlived its original purpose and now carries cost
   attribution and reproducibility.

**Why the events table ships before analytics:** every Application Analytics
metric — funnel conversion, ghost rate, time analysis — is computed from status
transitions with timestamps. Those cannot be reconstructed retroactively.
Capturing them from day one is what makes the analytics phase possible without a
data migration.

**Identity and deduplication:** source plus source job ID where available,
otherwise a normalised fingerprint of company, title and location. The
fingerprint deliberately excludes the URL, because the same posting often has
several URLs.

---

## 11. Open decisions (added in v1.1)

**C1 — Waiting period. RESOLVED (v1.2).** 14 days. PRD v1.0's "2 weeks" stands;
the Application Analytics document's 21 days is superseded. Held as a single
configuration value so it remains one place to change.

**C2 — Deemed Pending stored or derived.** Resolved as derived (§9.2). Recorded
because the Application Management document lists it among lifecycle outcomes,
which reads as a stored status.

**C3 — Match category vocabulary.** Three vocabularies exist across the
documents: Perfect / Dicey / Rejection Pool; Absolute / Relative / No Match; and
a separate pre-qualification classification. Stored as free text until the
scoring taxonomy is frozen.

**C4 — Outreach. RESOLVED (v1.2).** Moves to Phase 2. It belongs on the
Application board and is invoked on request, not generated for every
application. It needs its own table, because unlike referral there are many
messages per application.

**C5 — Table count.** Resolved: six tables, not four (§10).

**To verify before relying on:** Supabase free-tier limits and project pause
behaviour on inactivity; the current advisory status of the spreadsheet parsing
library.

---

## 12. Phase boundaries (added in v1.1, revised in v1.6)

**Phase 1 — delivered.** Manual ingestion and application management. Upload,
validation, deduplication, the application dashboard and workspace, job score
display, resume and cover letter storage and download, status lifecycle,
referral tracking, application attempts and the activity timeline.

**Phase 1.5 — scoped 2026-09-03, not started.** Closes the loop at the front of
the funnel: jobs arrive on a schedule instead of by hand, and the ones worth
attention are scored automatically. **37 stories — 25 ready, 12 awaiting a
decision.** Seven workstreams:

| # | Workstream | Stories |
|---|---|---|
| W1 | LinkedIn ingestion on a GitHub Actions cron, via Apify | 15 |
| W2 | Data cleansing and lifecycle classification | 2 |
| W3 | Pre-qualification into piles | 5 |
| W4 | Automated scoring + score quality | 6 |
| W5 | Daily digest mailer | 4 |
| W6 | Mandatory SimG (Pass G) | 3 |
| W7 | Per-application AI cost visibility | 2 |

Three boundaries drawn deliberately:

- **Scoring is automated; document generation is not.** A daily run scores what
  pre-qualifies; CV and cover letter stay a button press. This bounds unattended
  spend and keeps the expensive path under human judgement.
- **Execution is GitHub Actions, not Vercel.** A scored batch will not fit in a
  Vercel function timeout. Vercel stays a read and UI surface.
- **Pre-qualification sits between `raw_jobs` and `applications`,** which changes
  the D1 rule in §9.3. Without it the first scheduled run creates hundreds of
  unwanted application records.

Explicitly **out** of Phase 1.5: the multi-source adapter framework (one source
does not justify a registry and mapping configuration), other job boards,
career-site watchers, and Application Analytics.

**Phase 2.** Outreach generation and history on the Application board, invoked
on request (C4). Additional sources — Reed, Adzuna, Jooble, VisaSponsor.jobs —
career-site watchers, and the source adapter framework once a second source makes
it worth building. CV recommendation review before download (JSV2S1126).

**Phase 3.** Application analytics, infrastructure usage tracking, and interview
preparation. Analytics stays here deliberately: shortlist rate, conversion and
ghost rate are ratios over outcomes, and outcomes accrue over months.
`application_events` has captured the raw material since Phase 1, so waiting
costs nothing.

**Phase 4.** Consolidated requirement-document generation (JSV2S1125).
