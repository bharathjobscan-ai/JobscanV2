# SimG — Adversarial Evaluation (Pass 2 / Pass G)

Companion to `SKILL.md`. Run **after** GenG has produced a CV and cover letter,
passing it the job description and the generated documents.

Kept separate so it is not sent on every generation call. Wiring it in as an
automatic step is JSV2S1058 (Phase 2).

## Inputs

- The job description
- The generated CV (markdown)
- The generated cover letter (markdown)

## Method

Only runs when user says "Run SimG" or "Pass 2."

Takes the generated CV + Cover Letter from Pass 1 and runs a 3-layer adversarial evaluation:

**Layer 1 — ATS Check:**
- Keyword match against JD
- Formatting compliance (single-column, standard headers, no tables)
- Parsing readiness — will ATS software extract fields correctly?

**Layer 2 — Recruiter Scan (6 seconds):**
- Clarity — Can the recruiter identify role fit in 6 seconds?
- Impact visibility — Are key metrics visible above the fold?
- Differentiation — Does anything make this CV stand out?

**Layer 3 — Hiring Manager Review:**
- Depth — Does experience demonstrate real understanding?
- Relevance — Is the CV tailored to THIS role, or generic payments PM?
- Seniority fit — Does it read as a Senior PM?

**Decision Rule:**
- If verdict = Reject or Borderline: Provide specific fixes with clear before/after examples. Do NOT re-summarize the same content. Reboot and rethink.
- Maximum additional iterations after SimG: ONE. After one rewrite, output is final.
- If verdict = Pass: Output is final.

## Output

Return the verdict and any fixes as markdown. Fonts, layout and file generation
are handled by the application — focus entirely on the critique and the specific
before/after changes.
