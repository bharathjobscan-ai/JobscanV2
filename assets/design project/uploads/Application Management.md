# JobScanV2 — Application Management
## Product Design / Vision Document

### 1. Purpose

Application Management is the user's primary execution workspace once a job has been selected for pursuit.

Its purpose is to convert a qualified job opportunity into a manageable application record containing everything required to review, prepare, apply, follow up and track the outcome.

The experience should be **action-oriented, simple and information-dense without feeling crowded**.

### 2. Core Product Flow

Qualified Job
    ↓
Application Created
    ↓
Prepare / Review
    ├── Tailored Resume
    ├── Tailored Cover Letter
    ├── Job Score + Analysis
    ├── Referral
    └── Outreach
    ↓
Apply
    ↓
Track Application
    ↓
Outcome

### 3. Application Dashboard

The dashboard should act as a unified application workspace.

Primary views:
- Ready to Apply
- Applied / Active
- Pending
- Closed
- All Applications

The dashboard should make three things immediately obvious:
1. **What is the opportunity?**
2. **Where is the application currently?**
3. **What should I do next?**

Each application should surface, at minimum:
- Role
- Company
- Country / Location
- Source
- Job Score
- Match category
- Visa Signal
- Referral status / requirement
- Application status
- Application date / last activity
- Link to job / career site
- Next recommended action

### 4. Application Detail

Each selected job becomes an application workspace with the following sections.

#### Job Context

Retain the original job information and provide access to the source posting and external application URL.

#### Resume & Cover Letter

Show the role-specific:
- Tailored Resume
- Tailored Cover Letter

Both should be ready to review and download.

#### Job Score

Show:
- Overall Job Score
- Score breakdown / rationale
- Strengths
- Gaps
- Relevant visa signals
- Link to the complete score analysis

The score should represent the version used when the application opportunity was evaluated.

#### Application Status

Supported lifecycle outcomes:
- Ready to Apply
- Applied
- Shortlisted
- Interview
- Rejected — Application
- Rejected — Screening
- Rejected — Interview
- Rejected — Visa
- Deemed Pending

The application should retain its history rather than only showing the current state.

#### Referral

Capture whether a referral exists for the role using the following supported states:
- `Not Needed`
- `Needed`
- `Requested`
- `Secured`

The product should support referral progress and relevant referral information. Referral should be visible as an important application signal, particularly for Dicey Match opportunities.

#### Outreach

Provide the ability to:
- Generate recruiter outreach
- Generate hiring manager outreach
- Generate referral outreach

Messages should be generated from predefined formats and customized to the specific role/company. Outreach generation is **on-demand**, rather than automatically generated for every application. The product should maintain visibility of outreach already generated/sent.

#### Application Attempts

A single job may have multiple application attempts. Architecturally, this is structured with a parent `application` record (representing the job opportunity) and a child `application_attempts` table (representing each distinct try). 

The application workspace should allow the user to record and distinguish attempts, including situations where a fresh application is made after a previous application.

The system should preserve:
- Attempt history
- Timing
- Relevant application details
- Outcome of each attempt

This allows later analysis of whether subsequent application attempts produce better outcomes.

### 5. Application Timeline

Each application should have a simple chronological activity history covering:
- Application created
- Resume / CL generated
- Referral activity
- Outreach activity
- Application submitted
- Status changes
- Application attempts
- Final outcome

The timeline is intended to provide context and support later analytics.

### 6. Key UX Principle

The application page should always emphasize the **next action**.

Examples:
READY TO APPLY → Review Resume, Review Cover Letter, Apply
DICEY MATCH → Find / Request Referral, Review Outreach, Apply
APPLIED → Await Response, Follow Up / Outreach
INTERVIEW → Prepare Technical Material, Review Gaps

The user should not need to navigate through multiple pages to understand what to do next.

### 7. Product Boundaries

Application Management owns the application lifecycle and application history.

It consumes outputs from Job Ingestion, Pre-Qualification, ScoreG, CVG / Resume Tailoring, and Outreach generation. It should not duplicate their underlying logic.

### 8. Design Direction

The interface should be:
- Minimal
- Calm
- Highly legible
- Action-oriented
- Low visual noise
- Consistent across desktop views
- Focused on hierarchy rather than decorative UI

The dashboard should feel like a **personal operating console for applications**, not a conventional ATS.

### 9. Success Criteria

The module succeeds when the user can open the dashboard and quickly answer:
- Which applications need my attention?
- Which jobs are ready to apply?
- What is the expected value of each opportunity?
- Do I need a referral?
- Is my resume/CL ready?
- What has happened so far?
- What should I do next?