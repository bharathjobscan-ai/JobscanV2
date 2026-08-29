# JobScan V2 — Product Backlog / Task Breakdown

This document captures the JobScan V2 implementation backlog across Ingestion, Intelligence, Optimization, Preparation, Applications, and Insights.

## 1. Ingestion

### Platform Foundation

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1001 | Source Adapter Framework | [Platform] Define source adapter contract | Define a common interface for all job sources so the orchestrator remains source-agnostic. |
| JSV2S1002 | Source Adapter Framework | [Platform] Create source registry | Create a configuration-driven registry to enable/disable job sources and associate each source with its adapter and mapping configuration. |
| JSV2S1003 | Configuration | [Platform] Define sources.yaml | Define source-level configuration including enabled state, source type, runtime parameters and fetch settings. |
| JSV2S1004 | Configuration | [Platform] Define mapping.yaml structure | Define a standard configuration format for mapping source-specific fields into the canonical Raw Job model. |
| JSV2S1005 | Configuration | [Platform] Define custom parser override mechanism | Allow source-specific code logic where configuration-only mapping is insufficient. |
| JSV2S1006 | Secrets | [Platform] Configure secrets management | Store Apify/API credentials and other source secrets securely through GitHub Secrets/environment configuration. |
| JSV2S1007 | Canonical Model | [Platform] Define RawJob schema | Define the canonical job object shared by every source before persistence. |
| JSV2S1008 | Canonical Model | [Platform] Add schema versioning | Add schema version so historical raw jobs can be safely reprocessed when the model evolves. |
| JSV2S1009 | Persistence | [Platform] Create RAW_JOBS table | Persist normalized job fields, source identifiers, URLs, raw payload and ingestion lifecycle metadata. |
| JSV2S1010 | Persistence | [Platform] Create INGESTION_RUNS table | Track each source execution, volume, status, duration and failures. |
| JSV2S1011 | Observability | [Platform] Establish ingestion logging | Standardize logs across sources for fetch, mapping, validation, dedupe and persistence stages. |
| JSV2S1012 | Observability | [Platform] Establish ingestion metrics | Track jobs fetched, inserted, updated, duplicated, reposted and failed by source/run. |
| JSV2S1013 | Reliability | [Platform] Define source failure isolation | Ensure one failed source does not stop other sources from executing. |
| JSV2S1014 | Reliability | [Platform] Define retry/backoff strategy | Standardize retry behaviour for API failures, rate limits and transient errors. |
| JSV2S1015 | Reliability | [Platform] Define failed-job/DLQ handling | Preserve failed payloads and processing errors for investigation/reprocessing without breaking the ingestion run. |

### Scheduler

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1016 | Periodic Execution | [Platform] Configure GitHub Actions CRON | Schedule ingestion jobs at the required daily/periodic frequency. |
| JSV2S1017 | Periodic Execution | [Platform] Implement ingestion orchestrator | Load enabled sources, execute adapters, collect results and manage run lifecycle. |

### Parallel Execution

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1018 | Parallel Execution | [Platform] Enable independent source execution | Allow multiple source adapters to execute independently/parallel where appropriate. |

### Fetcher — LinkedIn

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1019 | LinkedIn | [Functional] Integrate LinkedIn via Apify | Trigger the selected LinkedIn Apify Actor and retrieve job records. |
| JSV2S1020 | LinkedIn | [Functional] Define LinkedIn fetch parameters | Configure keywords, locations, recency and other supported search parameters. |
| JSV2S1021 | LinkedIn | [Functional] Extract LinkedIn job details | Capture LinkedIn job ID, title, company, location, posting information, description and LinkedIn URL. |
| JSV2S1022 | LinkedIn | [Functional] Resolve external application URL | Capture the actual external career/ATS application URL rather than Easy Apply where available. |

### Fetcher — Other Sources

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1023 | Reed | [Functional] Integrate Reed source | Implement Reed API extraction and retrieve configured job fields. |
| JSV2S1024 | Adzuna | [Functional] Integrate Adzuna source | Implement Adzuna API extraction and retrieve configured job fields. |
| JSV2S1025 | Visa Sponsor Jobs | [Functional] Integrate VisaSponsor.jobs API | Fetch jobs from the configured VisaSponsor.jobs API endpoint. |
| JSV2S1026 | Jooble | [Functional] Integrate Jooble source | Implement Jooble extraction using the supported access mechanism. |

### Watcher — Verified Sponsor Companies

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1027 | Verified Sponsor Companies | [Functional] Define verified sponsor company registry | Maintain the list of companies whose career sites should be monitored specifically for sponsorship opportunities. |
| JSV2S1028 | Career Sites | [Functional] Define career-site source configuration | Configure company career URLs/ATS endpoints and source-specific fetch rules. |
| JSV2S1029 | Career Sites | [Functional] Implement career-site watcher adapter | Fetch new or changed jobs directly from verified company career sites. |
| JSV2S1030 | Career Sites | [Functional] Detect new/updated career jobs | Identify newly posted and changed roles across watched career sites. |

### Upload — Manual Job Creation

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1031 | Manual Job Creation | [Functional] Define upload template | Create a standard CSV/XLSX format for manually adding jobs not discovered through configured sources. |
| JSV2S1032 | Manual Job Creation | [Functional] Implement file upload ingestion | Allow uploaded jobs to enter the same ingestion pipeline as fetched jobs. |
| JSV2S1033 | Validation | [Functional] Validate uploaded job records | Validate required fields and reject/flag malformed records before ingestion. |
| JSV2S1034 | Source Traceability | [Functional] Capture manual/inbound source metadata | Record where manually uploaded jobs originated, e.g. referral, recruiter, external portal, networking lead. |

### Pre-Qualification

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1035 | Mapping & Normalisation | [Functional] Implement source-to-canonical mapping | Transform each source response into the common RawJob structure using mapping configuration/custom parser logic. |
| JSV2S1036 | Validation | [Functional] Validate canonical RawJob | Ensure required fields such as title, company, source and source URL are present and correctly formatted. |
| JSV2S1037 | Filtering | [Functional] Define pre-qualification rules | Establish configurable filters for domain, role, experience and location. |
| JSV2S1038 | Filtering | [Functional] Apply pre-qualification filters | Apply configured rules before jobs reach the downstream dashboard. |
| JSV2S1039 | Dedupe | [Functional] Implement job identity resolution | Determine job identity using source + source job ID, external URL and fallback fingerprint. |
| JSV2S1040 | Classification | [Functional] Classify job lifecycle state | Classify jobs as New, Existing, Updated, Reposted or Duplicate. |
| JSV2S1041 | Lifecycle | [Functional] Track first/last seen timestamps | Maintain job observation history to support repost and active-listing detection. |

### Notification

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1042 | Daily Summary | [Functional] Define daily ingestion summary | Define the daily metrics and job summary to be communicated. |
| JSV2S1043 | Daily Summary | [Functional] Generate daily job digest | Generate a summary of jobs fetched, new jobs, reposts, updates and notable failures. |
| JSV2S1044 | Email | [Functional] Implement daily mailer | Send the daily ingestion summary to the configured recipient(s). |
| JSV2S1045 | Monitoring | [Functional] Surface source failures in notification | Highlight failed/partial source runs so ingestion health is visible alongside the job summary. |

### Testing & Deployment

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1046 | Source Testing | [Platform] Create adapter contract tests | Verify every source adapter conforms to the common interface. |
| JSV2S1047 | Mapping Testing | [Platform] Create mapping/parser tests | Validate representative source payloads against expected RawJob outputs. |
| JSV2S1048 | Pipeline Testing | [Platform] Create end-to-end ingestion test | Validate the complete flow from fetch → map → dedupe → persistence → status tracking. |
| JSV2S1049 | CI/CD | [Platform] Add ingestion pipeline to CI/CD | Run tests, validation and deployment checks automatically for ingestion changes. |

---

## 2. Intelligence

### Post-Qualification Job Scorer — ScoreG

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1050 | Job Scorer Agent | Finalise ScoreG locations | Add Australia, Ireland, Lisbon and Default/EU location handling. |
| JSV2S1051 | Job Scorer Agent | Revisit visa evidence weights | Decide relative weighting between registry-based confirmation, public information, and default flooring score. |
| JSV2S1052 | Job Scorer Agent | Define ScoreG outcome enums | Classify result as Absolute Match, Relative Match / Transferable Skills, or No Match. |
| JSV2S1053 | Job Scorer Agent | Revisit domain skill set | Review and finalise currently hard-coded domain skills used by ScoreG. |

### Pre-Qualification Job Scorer

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1054 | Job Scorer Agent | Define prequalification taxonomy | Finalise the values for Role, Experience, Domain and Location filters. |
| JSV2S1055 | Job Scorer Agent | Define match classification | Define when a job qualifies as an absolute match vs associated/relative match, including weighting across individual parameters. |
| JSV2S1056 | Job Scorer Agent | Build configuration-driven filter engine | Implement filtering through configuration rather than code/deployment changes. |

---

## 3. Optimization

### CV Optimiser — Resume Tailoring

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1057 | ATS Check Enhancer | Address formatting issues | Address formatting issues, whitespace problems and incorrect LinkedIn URL. |
| JSV2S1058 | Mandatory PassG criteria | Make PassG mandatory | Pass G, check done by adversarial agent who verifies the output of CV optimiser, should be made mandatory. |
| JSV2S1059 | Secondary LLM Evaluation | Add independent resume scoring/evaluation | Add independent resume scoring/evaluation using a secondary LLM. Currently the output is verified with Gemini and ChatGPT manually and comments are provided to Claude to rebuild the final version of the resume. |
| JSV2S1060 | Optimisation threshold | Confirm target score | Confirm target score and optimisation objective; current stated aspiration is 90+. |
| JSV2S1061 | Gap Analysis | Identify gaps | Identify domain, experience, visa and other gaps against the job. |
| JSV2S1062 | CV/CL optimisation recommendations | Confirm recommendations | Confirm how much suggested content can be incorporated and how the projected score improvement should be represented. |
| JSV2S1063 | Interview Preparation Pointers | Surface preparation areas | Surface a brief list of areas to prepare where domain/experience gaps are material. Detailed preparation remains in Interview Prep. |

---

## 4. Preparation

### Technical Interview — Technical Guru

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1064 | Technical Guru | Remove unwanted sections while creating a chapter | Simplify existing Technical Guru structure by removing these sections: pre-quiz, post-quiz, homework. |
| JSV2S1065 | Technical Guru | Finalise authoring voice | Confirm desired tone and whether the document should explicitly avoid interview-preparation framing. |
| JSV2S1066 | Technical Guru | Remove first-person personalisation | Content should not directly address the candidate. |
| JSV2S1067 | Technical Guru | Add Juspay context | Author can use Juspay's business, PA/PayFac and India vs international context for relevant parallels. Different lines of business today can be provided as input. |
| JSV2S1068 | Technical Guru | Video links | Define/add relevant explanatory video links where useful. |
| JSV2S1069 | Technical Guru | NotebookLM output requirements | TL;DR, podcast/audio, and chapter-wise video/audio with a maximum duration of 12 minutes. |
| JSV2S1070 | Technical Guru | NotebookLM integration | Determine technical mechanism for generating/embedding NotebookLM-derived outputs. |

### Case Study Interview — Case Study Guide

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1071 | Case Study Guide | Finalise case examples | Rework and approve the examples used in the consolidated case-study guide. |
| JSV2S1072 | Case Study Guide | Define template variations | Finalise the case types/variations for which reusable templates should exist. |
| JSV2S1073 | Case Study Guide | Claude practice workflow | Explore a practice environment through Claude; currently marked as ambitious. |

---

## 5. Applications

## Application Management

### Unified Application Workspace

| Sno | Story | Task | Priority | Description |
|---|---|---|---|---|
| JSV2S1074 | Application Dashboard | Create unified application dashboard | P0 | Provide a single workspace to view and manage all jobs that have progressed into an application, from Ready to Apply through final outcome. |
| JSV2S1075 | Application Dashboard | Define application lifecycle views | P0 | Organise applications across key stages such as Ready to Apply, Applied, In Process, Pending and Closed. |
| JSV2S1076 | Application Detail | Create application detail view | P0 | Provide a consolidated view of everything relevant to an application — job, score, resume, cover letter, referral, outreach and application history. |

### Job Context

| Sno | Story | Task | Priority | Description |
|---|---|---|---|---|
| JSV2S1077 | Job Context | Display original job information | P0 | Retain access to the original job posting, source, job link and relevant posting information. |

### Application Preparation

| Sno | Story | Task | Priority | Description |
|---|---|---|---|---|
| JSV2S1078 | Resume & Cover Letter | Attach tailored resume and cover letter | P0 | Store and surface the role-specific CV and CL prepared for the application. |
| JSV2S1079 | Resume & Cover Letter | Download application material | P0 | Allow the user to download the final resume and cover letter for application. |
| JSV2S1080 | Job Score | Display post-qualification Job Score | P0 | Show the score used to determine the application opportunity. |
| JSV2S1081 | Job Score | Display detailed score analysis | P0 | Provide the reasoning, strengths, weaknesses and relevant signals behind the Job Score. |

### Application Lifecycle

| Sno | Story | Task | Priority | Description |
|---|---|---|---|---|
| JSV2S1082 | Application Status | Define application status model | P0 | Track progression from application submission through shortlist, interview and final outcomes. |
| JSV2S1083 | Application Status | Track application outcomes | P0 | Support Applied, Shortlisted, Interview, Rejected – Application/Screening/Interview/Visa and Deemed Pending. |
| JSV2S1084 | Application Status | Track status history | P0 | Maintain visibility of how the application progressed over time. |
| JSV2S1085 | Pending Applications | Define deemed-pending logic | P0 | Identify applications that have not received a response after the defined waiting period. |

### Referral Management

| Sno | Story | Task | Priority | Description |
|---|---|---|---|---|
| JSV2S1086 | Referral Tracking | Capture referral status | P0 | Record whether the application has a referral and its current state. |
| JSV2S1087 | Referral Tracking | Manage referral information | P0 | Maintain relevant information about the referral associated with the application. |
| JSV2S1088 | Referral Tracking | Link referral to application outcome | P0 | Enable referral activity to be associated with the eventual application outcome. |

### Outreach

| Sno | Story | Task | Priority | Description |
|---|---|---|---|---|
| JSV2S1089 | Outreach Generation | Generate custom outreach messages | P0 | Generate role/company-specific messages using predefined recruiter, hiring manager and referral formats. |
| JSV2S1090 | Outreach Management | Manage outreach history | P0 | Maintain visibility of messages generated and outreach performed for each application. |
| JSV2S1091 | Outreach | Support recruiter/hiring manager outreach | P0 | Enable generation and execution of relevant outreach for the application. |
| JSV2S1092 | Outreach | Support referral outreach | P0 | Enable generation of referral-specific outreach when required. |
| JSV2S1093 | Outreach | Support communication channels | P0 | Enable supported outreach through Gmail and LinkedIn, subject to platform capabilities. |

### Application Attempts

| Sno | Story | Task | Priority | Description |
|---|---|---|---|---|
| JSV2S1094 | Multiple Application Attempts | Track application attempts | P0 | Allow multiple attempts against the same job opportunity to be captured independently. |
| JSV2S1095 | Multiple Application Attempts | Capture attempt details | P0 | Record relevant information for each application attempt, including timing and outcome. |
| JSV2S1096 | Reapplication | Track reapplication outcome | P0 | Understand whether subsequent applications resulted in a different outcome from the original attempt. |

### Application History

| Sno | Story | Task | Priority | Description |
|---|---|---|---|---|
| JSV2S1097 | Application Timeline | Provide application activity timeline | P0 | Provide a chronological view of application, referral, outreach, status and attempt activity. |
| JSV2S1098 | Application History | Maintain application record | P0 | Preserve the complete history of an application for future analysis and learning. |

---

## 6. Insights

## Application Analytics

### Application Funnel — Core Metrics

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1099 | Core Application Metrics | Total Applications | Measure total number of applications submitted over the selected period. |
| JSV2S1100 | Core Application Metrics | Awaiting Response | Measure applications currently awaiting an employer response. |
| JSV2S1101 | Funnel Conversion | Shortlist Rate | Measure the percentage of applications progressing to shortlist. |
| JSV2S1102 | Funnel Conversion | Interview Rate | Measure the percentage of applications progressing to interview. |
| JSV2S1103 | Funnel Conversion | Conversion Rate | Measure movement from application to the defined successful outcome. |

### Rejection Analysis

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1104 | Rejection Metrics | Overall Rejection Rate | Measure the overall proportion of applications resulting in rejection. |
| JSV2S1105 | Rejection Metrics | Application-stage rejection | Measure rejection occurring after application and before further progression. |
| JSV2S1106 | Rejection Metrics | Screening rejection | Measure rejection occurring after screening. |
| JSV2S1107 | Rejection Metrics | Interview rejection | Measure rejection occurring after interview. |
| JSV2S1108 | Rejection Metrics | Visa rejection | Measure rejection specifically attributable to visa/sponsorship. |

### Response Analysis — Ghosting

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1109 | Ghosting | Ghost Rate | Measure applications that receive no meaningful response after the defined waiting period. |

### Referral Analysis

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1110 | Referral Impact | Referral vs non-referral performance | Compare application outcomes where a referral was present vs absent. |
| JSV2S1111 | Referral Impact | Referral shortlist performance | Understand whether referrals improve shortlist rate. |
| JSV2S1112 | Referral Impact | Referral interview performance | Understand whether referrals improve interview conversion. |
| JSV2S1113 | Referral Impact | Referral conversion performance | Understand whether referrals improve eventual conversion. |

### Performance Analysis

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1114 | Country Analysis | Analyse application performance by country | Understand differences in application, shortlist and interview performance across countries. |
| JSV2S1115 | Time Analysis | Analyse performance over time | Track how application performance changes across periods. |
| JSV2S1116 | Score Analysis | Analyse Job Score vs outcome | Understand whether higher-scoring jobs actually produce better application outcomes. |
| JSV2S1117 | Source Analysis | Analyse source performance | Understand which job sources generate better opportunities and outcomes. |

### Dashboard

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1118 | KPI Dashboard | Application performance dashboard | Provide a consolidated view of the key application performance metrics. |
| JSV2S1119 | Funnel Dashboard | Application funnel | Visualise progression from Application → Shortlist → Interview → Outcome. |
| JSV2S1120 | Rejection Dashboard | Rejection breakdown | Show where applications are being lost across the application lifecycle. |
| JSV2S1121 | Referral Dashboard | Referral performance | Show the measurable impact of referrals on application outcomes. |

### Analytics Filters

| Sno | Story | Task | Description |
|---|---|---|---|
| JSV2S1122 | Analytics Filters | Country filter | Filter analytics by country. |
| JSV2S1123 | Analytics Filters | Date filter | Filter analytics by selected date range. |
| JSV2S1124 | Analytics Filters | Referral filter | Filter analytics for referred vs non-referred applications. |

---

## Priority Notes

The source document explicitly marks the Application Management backlog (JSV2S1074 through JSV2S1098) as **P0**, while the earlier Ingestion, Intelligence, Optimization and Preparation items do not show explicit priority values in the extracted task tables.

## Status

The source contains a Status column, but the supplied document does not provide populated status values in the visible task rows.
