# JobScan V2 — Product Requirements Document

**Current version:** 1.5 · **Last updated:** 2026-08-29 · **Owner:** Bharath Raghu

---

## Document control

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

## 3. Available subscriptions

- Google AI Pro
- Claude Pro
- Apify LinkedIn Job Scraper Actor, if required

**Clarification added in v1.1:** Claude Pro does **not** include Anthropic API
access. They are separate products with separate billing. See §9.4.

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

**MVP:** every valid uploaded row becomes an application at `Ready to Apply`
immediately, because MVP uploads are pre-filtered outside the system.

**Phase 2:** jobs that pass pre-qualification become applications, with job
score, CV and cover letter generated by default. Jobs that fail remain as raw
jobs with no application.

### 9.4 AI execution mechanism

Claude Pro does not include Anthropic API access. Four mechanisms were assessed:
a local Claude Code worker, the metered Anthropic API, an MCP server driven from
Claude Code, and a manual copy-paste bridge.

**Decision:** a local Claude Code worker for the MVP, behind a provider
interface, with a fixture-based mock driver as the default.

The application enqueues work in an `ai_jobs` table. A worker on the user's Mac
claims rows and runs Claude Code headless against the Pro subscription. Vercel
cannot spawn Claude Code, so generation is asynchronous.

The worker performs no domain writes. It stores a raw result; the application
promotes that into documents, scores and timeline events. This keeps the write
path in one place.

**Accepted risks:** the Pro subscription's usage allowance is the binding
constraint, and it is shared with the Claude Code sessions used to develop this
product. Driving a subscription CLI as an unattended application backend is a
grey area in the consumer terms; accepted knowingly for personal single-user use.
Nothing generates while the Mac is off. The provider interface means moving to a
metered API driver is one additional file.

**Indicative cost if the metered API were used** (not paid today), at Opus 5
$5/$25 per MTok and Sonnet 5 $2/$10: approximately $0.05 per job score and $0.50
per CV and cover letter package. At 10 scores and 2 packages per day that is
about $1.52 daily, $10.64 weekly, $45.60 monthly.

### 9.5 Model selection

- **Job scoring** — Claude Sonnet 5, effort high
- **Resume and cover letter** — Claude Opus 5, effort high

**Pass G (v1.3).** The adversarial validation pass is not auto-invoked. It runs
on explicit confirmation today, so each of the resume and cover letter tasks is
a single call. Making it mandatory is JSV2S1058 (Phase 2) and will add roughly
one further call's worth of tokens per package.

Set per task via environment configuration, not hardcoded, so the split can be
changed without a code change. Claude Code takes its effort level from its own
settings file rather than a per-invocation flag.

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

### 9.7 Token accounting (added in v1.2)

Token usage is **measured, not estimated**. The worker captures the counts
Claude Code reports for each run and stores them against the job, so cost per
job comes from real data. `npm run ai:report` summarises measured runs, averages
per task, and projects the cadences above.

On the Pro subscription nothing is charged. The figures answer what the work
would cost on the metered API, and indicate how hard each run draws on the
subscription allowance.

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
6. **ai_jobs** — the work queue for the local worker.

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

## 12. Phase boundaries (added in v1.1)

**Phase 1 — delivered.** Manual ingestion and application management. Upload,
validation, deduplication, the application dashboard and workspace, job score
display, resume and cover letter storage and download, status lifecycle,
referral tracking, application attempts and the activity timeline.

**Phase 2.** Outreach generation and history on the Application board, invoked
on request (C4). Automated fetching, source adapters, LinkedIn via Apify, other
job boards, career-site watchers, the scheduler, pre-qualification filters and
the daily digest. Also the scoring and CV-optimiser refinements.

**Phase 3.** Application analytics and interview preparation.
