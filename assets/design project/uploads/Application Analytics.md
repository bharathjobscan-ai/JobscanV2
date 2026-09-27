# JobScanV2 — Application Analytics
## Product Design / Vision Document

### 1. Purpose

Application Analytics is the feedback layer of JobScanV2.

Its purpose is to answer:

> **Is my job-search strategy working, where am I losing opportunities, and what should I change?**

Analytics should convert application history into actionable learning about:
- Application quality
- Conversion through the hiring funnel
- Rejection points
- Referral impact
- Country performance
- Job-score effectiveness
- Overall search efficiency

### 2. Core Product Flow

Application History
       ↓
Application Outcomes
       ↓
Funnel Analysis
       ↓
Rejection / Ghost / Referral Analysis
       ↓
Identify Patterns
       ↓
Course Correct

Analytics is derived from Application Management data and should not maintain an independent version of application truth.

### 3. Executive KPI View

The dashboard should provide a small set of highly visible headline metrics:
- Total Applications
- Awaiting Response
- Shortlist Rate
- Interview Rate
- Rejection Rate
- Ghost Rate
- Conversion Rate

The first screen should answer:
> **Am I getting enough of the right applications, and are they converting?**

### 4. Application Funnel

The primary visualization should show progression through the application funnel:

Applications
      ↓
Shortlisted
      ↓
Interview
      ↓
Successful Outcome

The dashboard should make drop-offs between stages immediately visible.

### 5. Rejection Analysis

Break rejection into meaningful stages:
- Rejected after Application
- Rejected after Screening
- Rejected after Interview
- Rejected due to Visa

The purpose is not merely to report rejection volume, but to identify **where the candidate is losing opportunities**.

Examples:
High Application Rejection → Potential targeting / CV / qualification issue
High Screening Rejection → Experience / domain / positioning issue
High Interview Rejection → Interview preparation issue
High Visa Rejection → Sponsorship targeting issue

These interpretations are intended as product insights, not hard-coded conclusions.

### 6. Ghost Rate

Ghost Rate measures applications where no meaningful response is received after a defined waiting period of **21 days**.

The metric should be clearly distinguishable from ordinary applications that are still within the expected 21-day response window.

### 7. Referral Analysis

Referral performance should be directly comparable:

                    Referral    No Referral
Shortlist Rate          X%           Y%
Interview Rate          X%           Y%
Conversion Rate         X%           Y%

The objective is to determine whether referrals materially improve application outcomes. This should eventually become one of the most useful decision-making views in JobScan.

### 8. Job Score Effectiveness

Analytics should compare Job Score with actual outcomes.

Score Band       Shortlist   Interview
90+                 X%          X%
80–89               X%          X%
70–79               X%          X%
<70                 X%          X%

This allows the scoring model to be evaluated against real-world outcomes and improved over time.

### 9. Country / Market Analysis

Users should be able to understand application performance by country.

Useful measures include:
- Applications
- Shortlist Rate
- Interview Rate
- Rejection Rate
- Visa Rejection Rate
- Conversion Rate

The goal is to identify which markets are producing the strongest outcomes.

### 10. Time Analysis

Analytics should support date-based analysis to understand:
- Application volume over time
- Conversion trends
- Changes in shortlist/interview performance
- Impact of changes to targeting or application strategy

### 11. Core Filters

The initial dashboard should support:
- Country
- Date range
- Referral: Yes / No

The design should leave room for future filters without making the first version complicated.

### 12. Recommended Dashboard Structure

┌─────────────────────────────────────────────┐
│ Application Analytics                       │
│                                             │
│ Total   Awaiting   Shortlist   Interview    │
│ Apps    Response   Rate        Rate         │
│                                             │
├─────────────────────────────────────────────┤
│ Application Funnel                          │
│ Applications → Shortlist → Interview        │
│                                             │
├──────────────────────┬──────────────────────┤
│ Rejection Breakdown  │ Referral Impact      │
│ Application          │ With / Without       │
│ Screening            │ referral             │
│ Interview            │                      │
│ Visa                 │                      │
├──────────────────────┴──────────────────────┤
│ Performance by Country / Time / Score       │
└─────────────────────────────────────────────┘

### 13. Product Principle

Analytics should not become a collection of vanity metrics. Every metric should help answer one of four questions:
1. **Am I targeting the right jobs?**
2. **Is my application getting through the funnel?**
3. **Where am I losing opportunities?**
4. **What should I change?**

### 14. Product Boundaries

Application Analytics consumes data from Application Management.

Applications + Application History + Attempts + Referral Activity + Job Scores
        ↓
Application Analytics
        ↓
Insights / Course Correction

It should not alter application state or duplicate application lifecycle logic.

### 15. Design Direction

The interface should be:
- Minimal
- Calm
- Metric-led
- Highly legible
- Low visual noise
- Focused on trends and comparisons
- Avoid excessive charts

The dashboard should feel like a **decision-support console**, not a BI platform.

### 16. Success Criteria

The user should be able to look at the analytics dashboard and quickly understand:
- How many applications are active?
- How often am I getting shortlisted?
- How often am I reaching interviews?
- Where are applications getting rejected?
- Are referrals helping?
- Which countries are performing better?
- Does a higher Job Score actually predict better outcomes?
- What should I change in my job-search strategy?