# JobScan

## Vision

JobScan is an AI-powered platform that finds Product Management jobs with visa sponsorship. Every day it fetches jobs from multiple sources, scores them based on sponsorship likelihood and relevance, generates customised CVs, cover letters and application tracking.

## Overview

### Product Principles

1. **Modularity:** Every module must function standalone and compose with others.
2. **Low-cost infra:** Build with free-tier tools where possible.
3. **Privacy-first:** All data belongs to the user.
4. **Iteration over perfection:** Each module can evolve independently.

### Available Subscriptions

1. Google AI Pro subscription
2. Claude Pro subscription
3. Apify LinkedIn Job Scraper Actor if required

### Journey So Far

All of these are available as reusable workflows today, i.e. individual projects with instructions and files created to achieve each use case.

1. **Job Scorer** — Evaluates a job opportunity and assigns a score based on factors such as Visa, Domain and relevance.
2. **Company Profile** — Creates a 2-page report of each company. Upon shortlist, this shall be generated. The design, format, Python file and instructions are readily available for usage.
3. **CV Optimiser** — Customises the resume according to each job based on the JD. Performs ATS format checks, calls out domain gaps, prepares a crisp one-page CV and cover letter, and undergoes an adversarial pass to validate ATS, domain and coherency.
4. **Message Generator** — Sends curated emails/messages to Recruiter, Referrer or Hiring Manager.
5. **Technical Interview Preparation** — Generates a book (PDF) with clear chapters when subject matter and gaps to be covered are provided as inputs.
6. **Case Study Preparation** — Relies on a one-time generated book covering frameworks and examples for each type of case study to train an individual to crack case interviews.
7. **Application Tracker** — Maintained as a sheet in Google. No analytics.

---

# Journey Ahead

## 1. Job Ingestion

This part of the process is manual at this point. The user goes to LinkedIn, finds suitable jobs and manually calculates the score, customises the CV, generates outreach responses as individual sequential steps before applying for the role.

The vision of this module is to auto-fetch jobs across multiple recognised portals, apply pre-qualification filters such as location, role, domain and relevance, and populate them on the dashboard.

This feature should also provide a back door to upload jobs fetched manually through an Excel-based approach.

## 2. Application Management

Unified dashboard displaying all applicable jobs which are ready to apply, already applied, etc.

Each job in this section becomes an application with the following sections:

### a. Resume

CV and CL customised and generated for this role, ready to be downloaded.

### b. Job Score

Post-qualification job score generated along with the analysis.

### c. Application Status

Ability to update the status:

- Applied
- Shortlisted
- Interview
- Rejected - Shortlist
- Rejected - Screening
- Rejected - Interview
- Rejected - Visa
- Deemed Rejected (after 2 weeks of no response)
- Offer

### d. Referral

Add referral status if any for this role.

### e. Outreach

Generate custom messages out of the predefined formats in this section and send them through LinkedIn / Gmail.

### f. Application Attempt

For some jobs, sending a fresh application with a new email ID for a job already applied at the right time generates a shortlist. The system needs to capture the same.

## 3. Application Analytics

Track metrics to understand the performance of the application and candidate for visibility purposes.

- Total Application
- Awaiting Response
- Shortlist Rate
- Interview Rate
- Rejection Rate
  - Rejection post Interviews
  - Rejection post Screening
  - Rejection post application
- Ghost Rate
- Conversion Rate
- Filters
  - Geography
  - Dates
  - Referral - Yes / No

---

# High-Level User Flow

## 1. Discover & Ingest

Fetch jobs periodically across configured job boards, verified company career sites, and manual uploads.

## 2. Pre-Qualification

Apply deterministic filters for role, domain, experience, location, freshness and duplicates/reposts to remove low-value jobs.

## 3. Job Scoring & Categorization

Deep-score qualified jobs and classify them into:

- **Perfect Match**
- **Dicey Match**
- **Rejection Pool**

Flag referral requirements.

## 4. Material Generation

For high-potential jobs, generate tailored resumes, cover letters and identify domain/experience/preparation gaps.

Generate outreach, referral and technical-prep material only on request.

## 5. Daily Notification

Send the **Top 10 jobs per country** with:

- Key signals
- Score
- Category
- Referral flag
- Dashboard link

## 6. Dashboard & Action

The user reviews the curated feed, examines the analysis, applies, requests a referral, generates outreach/preparation material, or rejects the opportunity.

---

# Tech & Infra Architecture

| Layer | Technology | Recommendations by ChatGPT and Gemini | Cost |
|---|---|---|---|
| Frontend | Next.js + React + Tailwind | Use one framework instead of separate React frontend/backend concerns. Easy for Claude Code to scaffold and iterate. | ₹0 |
| Backend | Next.js API Routes / Server Actions initially | Avoid a separate Python/FastAPI server unless you actually need it. | ₹0 |
| Database | Supabase PostgreSQL Free | Best fit because you also need file storage, auth later, and a simple dashboard. | ₹0 |
| ORM | Drizzle ORM | Prefer over SQLAlchemy for this project because it keeps the stack TypeScript/Next.js-native. | ₹0 |
| AI | Claude API / existing Claude workflow | Reuse your existing Claude skills wherever possible. | Existing subscription |
| AI Review | Gemini + Antigravity | Development/review layer, not application runtime. | Existing subscription |
| Job Extraction | Apify | LinkedIn and other difficult sources. | API Usage |
| Scheduler | GitHub Actions | Daily CRON is more than enough. | ₹0 |
| Background Jobs | GitHub Actions | Don't introduce Redis/Celery/queues. | ₹0 |
| File Storage | Supabase Storage | Store resumes, CLs, PDFs, interview material and application documents. | ₹0 within free limits |
| PDF | No PDF library initially | Continue using Claude-generated reports/PDFs. Introduce a local library only if a measurable need emerges. | ₹0 |
| Git / CI | GitHub | Source control + Actions + versioning. | ₹0 |
| Hosting | Vercel | Host Next.js application using the existing account/free tier. | ₹0 |

---

# Project Structure

```text
jobscan-v2/
│
├── app/                         # Next.js application
│   ├── (dashboard)/
│   │   ├── jobs/
│   │   ├── applications/
│   │   ├── analytics/
│   │   └── settings/
│   │
│   ├── api/                     # API routes / backend endpoints
│   │   ├── jobs/
│   │   ├── applications/
│   │   ├── analytics/
│   │   ├── documents/
│   │   └── ai/
│   │
│   ├── layout.tsx
│   └── page.tsx
│
├── components/                  # Shared UI components
│   ├── ui/
│   ├── layout/
│   ├── jobs/
│   ├── applications/
│   └── analytics/
│
├── features/                    # Business/domain modules
│   ├── ingestion/
│   ├── qualification/
│   ├── scoring/
│   ├── applications/
│   ├── analytics/
│   ├── outreach/
│   ├── resume/
│   ├── interview/
│   └── notifications/
│
├── lib/                         # Shared infrastructure/services
│   ├── supabase/
│   ├── ai/
│   ├── storage/
│   ├── config/
│   ├── logging/
│   └── utils/
│
├── sources/                     # Job-board specific adapters
│   ├── linkedin/
│   │   ├── adapter.ts
│   │   └── mapping.yaml
│   ├── reed/
│   │   ├── adapter.ts
│   │   └── mapping.yaml
│   ├── adzuna/
│   │   ├── adapter.ts
│   │   └── mapping.yaml
│   ├── jooble/
│   │   ├── adapter.ts
│   │   └── mapping.yaml
│   ├── visasponsor/
│   │   ├── adapter.ts
│   │   └── mapping.yaml
│   └── career-sites/
│       ├── adapter.ts
│       └── mapping.yaml
│
├── workers/                     # Scheduled/background execution
│   ├── ingestion/
│   │   ├── fetch-jobs.ts
│   │   └── process-jobs.ts
│   ├── notifications/
│   │   └── daily-digest.ts
│   └── maintenance/
│
├── config/
│   ├── sources.yaml
│   ├── qualification.yaml
│   └── application.yaml
│
├── db/
│   ├── schema/
│   ├── migrations/
│   └── seed/
│
├── prompts/                     # Claude prompts / skill adapters
│   ├── scoreg/
│   ├── cvg/
│   ├── technical-guru/
│   ├── case-study/
│   └── outreach/
│
├── docs/
│   ├── architecture/
│   ├── product/
│   └── decisions/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── scripts/
│
├── .github/
│   └── workflows/
│       ├── ingestion.yml
│       ├── notifications.yml
│       └── ci.yml
│
├── .env.example
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

# Module Architecture

## 1. Ingestion

Responsible for finding, fetching, and normalizing job data from the Internet.

### Fetcher

Fetch jobs on a periodic basis.

### Watcher

Fetch jobs from verified visa-sponsorship-providing company career pages.

### Upload

File-based upload of jobs into the system.

If a job is found outside any configured job board or through inbound leads, create a job in the system through this upload mechanism.

### Pre-Qualification Filters

Filter based on:

- Domain
- Role
- Experience
- Location

Each job will be classified into:

- New
- Updated
- Reposted
- Duplicate

### Notification

Daily mailer containing a summary of jobs fetched.

## 2. Intelligence

Available.

## 3. Optimization

Available.

## 4. Applications

MD file attached.

## 5. Preparation

Available.

## 6. Insights

MD file attached.
