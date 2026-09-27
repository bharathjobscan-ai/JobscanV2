# Execution task board

**Current as of 2026-09-05.** Phase 1 delivered · Phase 1.5 in progress.

Traceability: the master backlog holds product tasks (`JSV2S####`); execution
subtasks (`JSV2S####-T##`) are created only when a product task is selected.
Work with no product parent uses an epic ID (`E6-T04`).

Status values: Not Started · Ready · In Progress · Blocked · Review · Completed · Deferred

A parent item is Completed only when the product outcome is implemented **and
validated**. Phase 1 was validated against a live Supabase database by
`npm run test:integration` (15 assertions covering upload, dedupe, views,
lifecycle, attempts, generation and cascade deletes), plus 188 unit tests, lint,
typecheck and a production build.

> `project-management/tracker/execution-tracker.csv` is the machine-readable
> record and the authority when the two disagree. This file is the readable view.

---

## Phase 1 — delivered

E1 Foundation, E2 Manual ingestion (JSV2S1031–1034), E3 Application dashboard
(JSV2S1074–1077), E4 Preparation (JSV2S1078–1081), E5 Lifecycle / referral /
attempts / history (JSV2S1082–1098), E7 Documentation — **all Completed.**
Row-level detail is in the execution tracker.

### E6 · AI layer — superseded in part

| ID | Type | Task | Status |
|---|---|---|---|
| E6-T01 | [AI] | `AiProvider` interface | Completed |
| E6-T02 | [AI] | Mock driver + deterministic fixtures | Completed |
| E6-T03 | [DB] | `ai_jobs` run ledger | Completed |
| E6-T04 | [AI] | Local worker: claim → `claude -p` → store | **Deferred — retired** |
| E6-T05 | [Backend] | `settleAiJobs` — the single write path | Completed |
| E6-T06 | [Frontend] | Queued / running / failed chips | Completed |
| E6-T07 | [Product] | Export ScoreG + CVG + master resume to `/prompts/` | Completed |
| E6-T08 | [QA] | Verify real generation end to end | In Progress |

**E6-T04 was retired, not finished.** Commit `7b67664` (2026-09-02) deleted
`workers/ai/run.mjs` and the `npm run worker` script. See
[ADR-0005](docs/decisions/0005-provider-apis.md), which supersedes ADR-0002:
providers are now called inline and synchronously, there is no queue and no
polling, and `ai_jobs` is a run ledger rather than a work queue.

### E8 · Live providers and deployment

| ID | Type | Task | Status |
|---|---|---|---|
| E8-T01 | [QA] | Integration suite against a live database | Completed |
| E8-T05 | [AI] | Anthropic + Gemini API drivers | Completed |
| E8-T02 | [Infra] | Deploy to Vercel | Not Started |
| E8-T03 | [QA] | Verify the password gate on the deployed URL | Not Started |
| E8-T04 | [QA] | Verify cover letter generation end to end | Not Started |

---

## Phase 1.5 — in progress

**72 stories: 29 Completed · 36 `Review` · 5 `Ready` · 1 `Blocked` · 1 `Deferred`** (2026-09-19).
Marked in `project-management/backlog/product-backlog.csv` with `Phase = Phase 1.5`.

Scope decisions taken: scoring is automated but **document generation stays
manual**; execution is **GitHub Actions cron**, not Vercel; the multi-source
adapter framework and Application Analytics are deliberately out.

### 2026-09-25 — ScoreG's report trimmed, and a cost the app was not counting

- **The report is now two sections, Key Insights and Web Search Evidence**
  (owner's decision). Application Strategy and Next Actions are gone from the
  skill's output format and from `SCORE_CONTRACT`. Stored reports are trimmed on
  render by `trimScoreReport`, which also drops the "SCORE: 70/100 — APPLY"
  line and the prose breakdown the page already shows from the JSON. The model
  wrote those in about half of 12 stored reports despite the contract.
- **Double bullets fixed.** `.prose-doc ul` had a disc as well as the
  renderer's own dot. Nested bullets now nest instead of flattening, so "Top 3
  gaps" is a label over its gaps, not a fourth item.
- **Gemini grounding input was not being counted.** Search results fed back to
  the model are billed as input but reported apart
  (`toolUsePromptTokenCount`). Now added. Owner's measurement: ₹223.65 of Gemini
  credit for 14 recorded scores. Owner's bill on 2026-09-25 split it: usage
  ₹189.44 + GST ₹34.12. Sep 3's ₹24.85 has no recorded run, most likely test
  calls whose records the 2026-09-04 fixture cleanup deleted. The current
  prompt's 3 runs cost ₹32.60, so **₹10.87 + GST = ₹12.83 a score**.
- **JSV2S1149 / 1150: part of each score is now computed in code** (owner's
  target: ₹10 a score including GST). About two thirds of a score's cost was
  the model's hidden thinking, much of it spent working through rubric rules
  the gate had already settled. `features/scoring/fixed.ts` now scores those
  components in code: country pathway, portal, the years part of seniority,
  experience fit, location, reachability, posting age, and the evidence tier
  in the UK or at Tier A. The model scores only the judgement components, and
  `finaliseScore` adds up the total, weights and overrides. Every rule was
  checked against the 14 stored scores. Where the model had been inconsistent
  (Reachability scored 5, 2 and 0 on the same input), code takes the value it
  chose most often.
  **Every score now searches the web, in every country** (owner, 2026-09-25).
  This reverses JSV2S1146's UK exception from 2026-09-19, and the watchlist
  exception briefly added the same day. Behavioral Signals exist only in search
  results, and the skill scores them 0 when no search ran, so each exception
  capped the visa pillar: the first re-score of GoCardless fell from 65 to 40 on
  visa. The ledger now records whether a run actually searched. First live
  re-score (GoCardless, before this reversal): **₹5.6 + GST = ₹6.6**, against
  ₹12.9 for the same job before; output and thinking tokens 8,365 → 3,872.
  With search restored: **GoCardless ₹9.61, Thought Machine ₹13.22** (was
  ₹14.68). Searched non-UK scores are still over the target: their thinking is
  spent weighing search results, which fixing components does not reduce.
  `THINKING_LEVEL_SCORING` now exists to test a lower thinking level. Unset, it
  keeps today's default (high).
  One regression was found and fixed: the prompt told the model that a company
  missing from the payments-core list gets no affinity bonus, which overrode
  the skill's own test. Thought Machine lost its +5 for Vault Payments that way
  (Domain Match 50 → 40). The list is curated, not complete, so the model now
  applies the skill's test to unlisted companies. The skill went from 19.7
  KB to 10.3 KB: history notes, the stale Source Trust table (it contradicted
  the evidence tiers), the input format and the duplicated search list are
  gone. **Not yet measured live**: the owner is regenerating a few scores.


Owner-requested, on `redesign/city-view` (JSV2S1172).

- **The resume column was empty on every row.** The list read
  `simg->'current'->>'composite'`, a key SimG has never written. It now computes
  the detail panel's own figure (weighted lenses from `LENS_WEIGHTS` plus
  accepted points, capped at 100) in SQL. Checked against live data: 2 of 2
  evaluated resumes match the detail screen (85, 99). The `minResume` filter
  was also a no-op for the same reason, and now works too.
- **Landing grid** leads with *ready to apply* (the card used to say "ready
  today", but the number was the all-time total) and adds *+N from today's run*,
  counted by `applications.created_at` in the pipeline page's `todayWindow()`.
  That window covers both scheduled runs and manual uploads. Live: 22 today,
  which matches the pipeline page's Qualified-today figure.
- **Opening a city lands on Ready to Apply.** "All" now needs `view=all`.
- **Every application is on exactly one card.** 34 of 160 were on none: they
  were not remote, they named only a country ("Netherlands", "United Kingdom")
  or a town outside the plan. `cityKeySql` is now the single definition, used
  by both the grid and the city table, replacing `cityForJob` and a SQL OR that
  had drifted apart. Order: remote → the city the posting names → **the city
  the fetch was looking for** → `other`. There are two new cards, **Remote**
  (always shown) and **Other locations** (shown only when non-empty). Live:
  160 of 160 placed, and every card's count matches its table.
- **Remote and Other locations have photographs**, built by
  `npm run cities:build` like the cities. Remote: "Laptop on a neat desk"
  (CC0). Other: "Northwestern Europe at Night" (NASA ISS, public domain). Both
  come from Wikimedia Commons.
- **The list gains an *Uploaded* column, and *Posted* is fixed.** Posted had
  been showing the ingest date, so a month-old advert fetched this morning
  read "today". It now shows the posting's own date.
- **Discard moved to the Overview, and it bins now.** It had been a demotion
  to `reject`, which deletes the application row, so it refused every scored
  or generated application with "Use the Bin" — and there was no way to bin
  one. `binApplication` bins the job and keeps the application, documents
  and history. Every applications query and the nightly scorer now exclude
  binned jobs, and the Bin view lists discarded applications with Restore.
  Checked on live data: a scored application was discarded, left all lists,
  appeared in the Bin, and came back with its resume score intact.
- **The Bin clears after 30 days, in one click**: *Clear N older than 30
  days*, with a confirm step. Permanent delete no longer refuses a promoted
  job if that job was binned, since discarding it was the decision. To keep
  spend history through that, **`ai_jobs.application_id` is now nullable and
  `on delete set null`** (applied to the live DB, 2026-09-24). Before this it
  cascaded, and a purge would have deleted cost rows and understated the
  month's budget.
- **Pipeline runs highlight qualified** in the Qualified pile's colour, in
  place in the run's summary line. The run's *Auto/Force qualified* links
  had pointed at `/applications?fetch=` with no city since the city redesign.
  That URL lands on the grid and drops the filter. They now open the run's
  city on `view=all`. Upload runs have no single city, so they show an unlinked
  count.

### 2026-09-19, later — six decisions closed, and ScoreG stopped paying twice

The owner settled 1161, 1053, 1050, 1051, 1164 and 1060 in one pass. Only
JSV2S1164's prose trimming is still open.

| Decision | What changed |
|---|---|
| 1161 | 8 city-level fetches, **200 per location**, $0.648/night worst case |
| 1053 | One domain vocabulary, injected — ScoreG's copy is gone |
| 1050 | Three location tiers, because fetch ⊂ gate |
| 1051 | Registry 25 → 10; the freed weight goes to the watchlist, not to search |
| 1164 | Strong Apply / Apply / Referral Only / Skip it |
| 1060 | 90 is a target, never a gate |

**The two banks had already drifted, and nobody knew.** ScoreG carried its own
Domain Match Bank: 43 terms against the gate's 100. The gate's was the corrected
one — its comments record removing bare `risk` (it admitted "Senior PM (IT/Cyber
Risk)") and demoting `apple pay` (every consumer app accepts it), both found
against a real 100-job London sample. None of that ever reached the skill. Two
banks answering one question can only disagree; there is now one.

**1051 nearly moved the weight to the most expensive signal.** The owner's
reasoning — actual sponsorship outranks a licence — is right, but "community
signal" and "recency evidence" are Step 3, which is *entirely web search*.
Growing it would have made grounding mandatory and fought 1146, 1149 and 1150 at
once. The evidence he wanted is already deterministic: the watchlist *is*
curated community and recency evidence. It moved there instead.

**And it had to be a maximum, not a sum.** A tier-4 watchlist hit now skips
scoring entirely, so ScoreG mostly sees *off-list* companies — where an additive
watchlist component scores zero. Additive would have pushed the whole
distribution below the Apply band. Evidence-tiered, take the maximum, and
absence costs nothing.

**The retired Visa Blocker List was itself a hazard.** Four of its eleven
entries were phrases like "Must have right to work in [country]" — generic
boilerplate on a large share of sponsorable postings, which it scored to zero.

1161 reverses the 2026-09-18 total-cap decision deliberately. `fetchWithinBudget()`
now guards what the total cap was really protecting, so a ninth location fails a
test rather than surfacing on an invoice.

**Storage is the next thing to bite:** 48,000 `raw_jobs` rows a month, mostly JD
text, against Supabase's 500MB free tier. It needs a retention rule inside the
first month, not in Phase 3.

### 2026-09-19 — the gate grew a fifth filter, and stopped rejecting uniformly

Built against the owner's two specification files and the design agreed with him
beforehand. [ADR-0006](docs/decisions/0006-prequalification-gate.md) carries the
revision; the PRD is at 1.9.

| What | Where |
|---|---|
| Visa language rules, as data | `config/prequalification/visa.ts` |
| The classifier | `features/prequalification/visa.ts` |
| Sponsorship watchlist, 78 companies | `config/companies/watchlist.ts` |
| Payments affinity, 62 companies | `config/companies/payments-core.ts` |
| Exact-match lookup, shared normalisation | `features/companies/lookup.ts` |
| Collision and duplicate audit | `npm run companies:audit` |
| Verdict on screen | `components/applications/gate-verdict.tsx` |

**Three defects were found by testing the new code, and all three were mine.**

1. **The positive patterns matched through negations.**
   `sponsorship[^.]{0,30}available` matches "sponsorship is NOT available", and
   an offer sitting beside a refusal is a contradiction, which resolves to
   REVIEW. So the three clearest refusals in the whole specification were
   precisely the ones the filter failed to act on. Fixed with a gap that refuses
   to cross a negation or a hedge.
2. **The proximity rule never fired.** It split on spaces, leaving `unable,` and
   `sponsorship.` as tokens that matched neither the negation set nor the
   sponsorship test — so §17 was dead on any sentence with punctuation in it,
   which is most of them.
3. **`ne(matchCategory, "gate_qualified")` would have disabled all scoring.**
   SQL inequality is null-blind and every ordinary unscored application has a
   NULL category, so that clause excluded all of them rather than the handful
   intended.

One false assertion was also removed: the detail screen printed "Sponsorship in
posting: Not mentioned" from a column the ingestion adapter no longer populates,
so it would have said that about every job from today onward.

**`ENGINE_REVISION` is 3, so every stored verdict is now stale** and shows the
"Rules changed" badge. Re-qualifying is a live-data operation and was left for
the owner rather than run unattended.

### 2026-09-05 — the migration gate cleared

Migrations `0005` (ingestion run ledger) and `0006` (pre-qualification columns)
are **applied to the live database**, and `npm run test:integration` passes
17/17. That closed **JSV2S1037, 1038, 1040, 1052, 1054, 1055, 1056** — the gated
ingest path is now validated, not merely implemented.

It did **not** close everything that was waiting on it. `Review` still means
unvalidated, and three groups remain for distinct reasons:

| Rows | Why still `Review` |
|---|---|
| JSV2S1010–1015 | `ingestion_runs` and `ingestion_failures` now exist, but no test touches either table. Needs run-ledger assertions. |
| JSV2S1016, 1019–1021 | Gated on the Apify decisions. Cannot be validated until a real fetch runs. |
| JSV2S1042–1045 | No digest has ever been sent. Needs E8-T02 (deployment) first. |

### 2026-09-05 — mandatory Pass G shipped

**JSV2S1057, JSV2S1058 and JSV2S1126 are Completed**, validated by 18 live-database
integration assertions, 256 unit tests, lint and a production build.

| What | Where |
|---|---|
| Deterministic ATS hygiene on the write path | `lib/documents/ats.ts` |
| SimG rewritten as a priced worklist | `prompts/cvg/SIMG.md` |
| Lens weights, pass bar, composite | `config/simg.ts` |
| Validation, substitution, projection | `features/simg/` |
| Git-style diff worklist | `components/applications/simg-worklist.tsx` |
| `simg` jsonb column | migration `0007` — applied |

Four decisions worth remembering, because each closed an anomaly:

1. **CVG no longer grades itself.** Score, verdict, match % and keyword coverage
   moved to SimG. Two instruments reporting one quantity can only disagree.
2. **Recommendations are independent by construction** — one per target, one
   deficiency each, any order. That is what makes the points additive; a
   conflict graph would have been the alternative and is not needed.
3. **The whole worklist must fit one page**, so "accept all" can never overflow.
   Re-checked deterministically on every accept, not trusted to the model.
4. **`contentMd` is never mutated.** The current CV is derived by replaying
   accepted edits, which buys undo without keeping revision history.

Two defects were found *during review* of the ATS pass and fixed: a regex that
swallowed the blank line after the contact block, and one that rewrote a third
party's LinkedIn profile to the candidate's own.

### 2026-09-05, later — six more rows closed unattended

| Rows | What closed them |
|---|---|
| JSV2S1010–1015 | `tests/integration/run-ledger.itest.ts` — 15 live-database assertions. The tables existed since migration 0005 and nothing had ever touched them. |
| JSV2S1127 | UK sponsor register: **143,071 licences loaded**, copy dated 2026-09-03. The measured failure is fixed — "Visa" and "Visa Inc" both resolve to VISA EUROPE LIMITED, A-rated, Skilled Worker. |
| JSV2S1141, 1142 | AI spend in the list view, and the scoring / documents / SimG split with SimG's share. |

**The alias audit earned its keep immediately.** `npm run sponsors:audit` checks
every hand-written trading-name alias against the loaded register; its first run
found **9 of 24 were wrong**. Adyen is listed as ADYEN N.V. LONDON BRANCH, Klarna
as Klarna Bank AB UK Branch, Mollie as Mollie B.V.; Apple, AWS, Nium and Thunes
hold no licence under the guessed names and were removed rather than guessed
again. Run it after every refresh — companies lose licences.

A note on why the lookup never does substring matching: a substring search for
`NIUM` matches **alumiNIUM**, and the register has plenty of aluminium firms.

### 2026-09-05, later still — Review triaged honestly

`Review` means built and unit-tested but **never observed working for real** —
not "awaiting a read-through". Triaging the 16 rows that carried it showed they
were stuck for four different reasons, only one of which was fixable here:

| Why | Rows |
|---|---|
| Needs a real Apify fetch | 1001, 1006, 1016, 1019, 1020, 1021, 1049 |
| Needs a deployment — no digest has ever been sent | 1042–1045 |
| Paused by the owner, so cannot be exercised | 1136, 1137 |
| **Closeable — and now closed** | 1131, 1132, 1138 |

**JSV2S1132** was validated by the owner's own UAT — its note had said "NOT yet
seen against real data", which the live run discharged. **JSV2S1138** was
validated against the database: all 14 real applications resolve a preferred
city from both "London Area" and "London, England" spellings (live data is all
London, so the Lisboa/München aliases stay unit-tested only).

**JSV2S1131 was finished rather than relabelled.** Billable grounding now lands
in the total: the month's grounded runs are ordered by finish time and anything
past the 5,000th is charged, so billability is a property of a run's *position
in the month*, not of the run. The same application legitimately costs more in a
month where it falls past the allowance. Computed once and shared by the detail
view and the batched list query, so the two cannot disagree.

### 2026-09-05, overnight — the night batch

Built unattended while the owner slept. **Both are `Review`: neither has been
seen by a human yet.**

**JSV2S1143 — location artwork.** Scope widened from European to worldwide on
the owner's instruction. 34 public-domain paintings, resolved city → country →
default, sharing pre-qualification's alias lists so the two cannot drift. The
default is deliberately *not* European (Hokusai), so a job with no stated
geography is not silently disguised as a London one.

Downloaded into `/public` rather than hotlinked, and the fetch script verifies
every file rather than trusting a filename. That earned its keep immediately:
**15 of 34 guessed Commons names 404'd** on the first run and were corrected
against the Commons search API. The set was then re-fetched at 1000px after the
first pass came to 34MB — permanent git weight for pixels rendered at 11%
opacity. Now 15MB.

`/artwork` is excluded from the auth gate: public-domain paintings are not
private, and gating them would spend a Vercel middleware invocation per image.

**JSV2S1140 — the deduction ledger.** Every point starts on the table and is
lost to a named rule. Pillar weights are TS-as-data in `config/scoreg.ts`
mirroring the skill, rather than parsed out of the model's prose arithmetic.
Reconciliation is **surfaced, not hidden**: if the ledger does not sum to the
stored score, the UI says so — the model contradicting its own itemisation is a
finding, not a rounding wobble.

### The new application-management stories

Raised 2026-09-05 from the supplied design, and **queued as a night batch** at
the user's request — the design build and the artwork fetch run unattended.

| ID | What |
|---|---|
| JSV2S1139 | Rebuild the detail screen to the approved design |
| JSV2S1140 | The score as a running deduction ledger |
| JSV2S1141 | AI cost in the list view — *not in the design; added deliberately* |
| JSV2S1142 | AI cost split by task in the detail view |
| JSV2S1143 | Location artwork backdrop — **parked as night work** |
| JSV2S1144 | Apify actor spend, captured and attributed |

**JSV2S1126 moved from Phase 2 into Phase 1.5**: a priced SimG worklist is
pointless without a way to accept items one at a time.

### Sequencing from here

**Everything buildable without a decision from the owner is done.** What remains
is gated on sign-off, on deployment, or on the Apify answers.

1. **UAT** — [project-management/uat/MVP2-signoff.md](project-management/uat/MVP2-signoff.md).
   Six scenarios, all requiring judgement, live providers, money or production.
2. **E8-T02/T03** deployment — unblocks the digest rows (1042–1045).
3. **Apify** — 1019/1020 answered, then 1017/1035/1021 and 1144.
4. Night batch, remaining: **1139** detail-screen rebuild, **1140** deduction
   ledger, **1143** artwork.
5. **JSV2S1147** wire the sponsor refresh into the cron.

## Blocked on you

**Nine backlog decisions.** The ask is recorded in each row's `Notes`:

| Order | ID | Decision needed |
|---|---|---|
| 1 | JSV2S1019 | Which Apify LinkedIn actor, and the budget ceiling |
| 2 | JSV2S1020 | Keywords, locations, recency, result cap |
| 3 | JSV2S1053 | Domain skill set sign-off |
| 4 | JSV2S1051 | Visa evidence weights |
| 5 | JSV2S1050 | ScoreG locations |
| 6 | JSV2S1042 | Daily digest contents |
| 7 | JSV2S1060 | Optimisation threshold — SimG's pass bar, defaulted to 90 |
| 8 | JSV2S1137 | Whether Apify spend shares the AI ceiling or gets its own |
| 9 | JSV2S1142 | Whether CV and cover letter are worth splitting into two calls to cost them separately |

**Conflict C3 is resolved** (2026-09-04), which closed JSV2S1037, 1052, 1054 and
1055. [docs/product/open-decisions.md](docs/product/open-decisions.md) now has no
open conflicts.

**Two spend acknowledgements** are implied by the Phase 1.5 scope: Apify is a
paid dependency, and automated scoring turns a per-click cost into roughly
$60–80/month unattended. Both are recorded in ADR-0005 and PRD §9.7.

---

## Deferred

| Scope | Reason |
|---|---|
| Source adapter framework — JSV2S1002–1005, 1018, 1046 | Configuration plumbing for one source. Build it when source #2 is real. |
| Other fetchers — JSV2S1023–1026 | Phase 2 |
| Career-site watchers — JSV2S1027–1030 | Phase 2 |
| Outreach — JSV2S1089–1093 | Phase 2 (C4) |
| Application Analytics — JSV2S1099–1124 | Phase 3. Ratios over outcomes need months of data; `application_events` is already capturing it. |
| Infra usage tracking — JSV2S1128, 1129, 1133 | Phase 3. The provider dashboards already show this. |
| Interview preparation — JSV2S1064–1073 | Phase 3 |
| Supabase Storage, PDF export | Until a measurable need (JSV2S1126) |
