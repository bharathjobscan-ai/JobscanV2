# SimG — Adversarial Evaluation (Pass 2 / Pass G)

Companion to `SKILL.md`. Runs automatically after GenG, against the job
description and the **generated CV**.

**Revised 2026-09-05 (JSV2S1058 + JSV2S1126).** SimG was a prose verdict invoked
on request. It is now a mandatory second call returning a **priced, independent
worklist** the user accepts item by item. Every rule below exists because the
application applies your output mechanically — there is no second model between
you and the document.

## Scope — the CV only

You evaluate and recommend changes to the **CV**. The cover letter is generated
by GenG, is deliberately not revised, and is not scored. Do not comment on it
and do not emit recommendations against it.

## What SimG scores — and what it does not

Two scores exist and must never share a label:

| | **Job score (ScoreG)** | **Document score (SimG)** |
|---|---|---|
| Question | Is this job worth applying to? | Is this CV good enough to send? |
| Moved by | The job, the visa evidence, the market | The CV only |

**A SimG point is a document point.** Accepting every recommendation does not
change the job score. Never claim it does.

## Inputs the application supplies

- The job description
- The **generated CV** (markdown)
- The **master resume** — the baseline, and the only evidence of what the
  candidate has actually done
- `atsParseScore` — parse readiness, already computed deterministically by
  `lib/documents/ats.ts`
- `lineBudget` — rendered lines still available on the single A4 page

## Two scores, one instrument

Score **both** documents against this job, on the same scale, in this one call:

1. `baseline` — the **master resume** against this JD. What the candidate would
   have scored untailored.
2. `current` — the **generated CV** against this JD.

The gap between them is what GenG earned. Both must come from your judgement,
not from GenG's keyword percentages — those are a different instrument and are
no longer reported by GenG. **Keyword coverage is yours now**: report it under
the ATS lens.

## The three lenses

**ATS.** Keyword coverage against the JD's must-have and good-to-have terms, and
whether the JD's vocabulary appears in the candidate's own words. Parse
readiness is given as `atsParseScore` — take it as fact, score the content half,
report the combined result.

**Recruiter, 6 seconds.** Role fit legible in six seconds; metrics above the
fold; anything differentiating. Judge the **top third only**.

**Hiring manager.** Depth of real understanding, tailoring to *this* role rather
than the domain, and whether it reads at the stated seniority.

Score each 0–100. The application computes the composite as
`0.30·ATS + 0.35·Recruiter + 0.35·HiringManager` — report the three, never the
composite.

## Already handled — do not report it

Whitespace, curly quotes, glyph bullets and the LinkedIn URL are repaired
deterministically before you see the CV (JSV2S1057). They are gone. A formatting
recommendation is a wasted line.

## The independence rule — the rule the arithmetic rests on

The user sees a running score that rises as items are accepted, in any order,
one at a time. That is only honest if your recommendations are independent. So:

1. **One recommendation per target.** No two may touch the same bullet, line or
   section. If a bullet needs two things, that is one recommendation.
2. **One deficiency per recommendation.** Two items that both fix "coaching is
   absent from the top third" are not independent — the second is worth nothing
   once the first lands. Merge them, or drop the weaker.
3. **Applicable in any order.** No item may depend on another having been
   applied. Never write "after deleting the wallet line, add…".
4. **Every item stands alone.** Accepting any subset must leave a coherent CV.

If you cannot make two ideas independent, ship the stronger one only.

## The page budget — a hard constraint on the worklist as a whole

The CV is a strict one-pager: **18 bullets maximum, 200 characters each**.
`lineBudget` tells you what is left.

**Accepting every recommendation must still fit one page.** The user has a
single "accept all" button and it must never produce an overflowing CV. So the
net effect of your whole worklist — inserts added, deletes removed, modifies
resized — must stay within `lineBudget`. If your best ideas do not fit, pair an
insert with a delete inside the same worklist, or cut the weakest item. Do not
hand back a list that only works partially accepted.

## Pricing

`points` is how much the **composite** rises if that item is accepted.

- Integers, 1–8.
- Price against the lens it belongs to, then weight it: 10 recruiter-lens points
  are worth `10 × 0.35 ≈ 4` composite points.
- **The sum of all `points` must not exceed `100 − current composite`.** If it
  does, you have over-promised — cut the weakest items rather than shaving
  every number.
- Order by points descending.

## Evidence — the rule that protects the candidate

A tailored CV omits things by choice, so absence is not dishonesty. Before
recommending an **insert**:

1. If the master resume evidences it, set `requiresConfirmation: false`.
2. If it does not, you are asking the candidate to assert something unverifiable.
   Set `requiresConfirmation: true` and put the precise question in `confirm` —
   "Confirm competitor analysis was done at Juspay."
3. **Never invent a metric.** If a number would strengthen a bullet and none
   exists, write it without the number and ask for the figure in `confirm`.

The user reviews these by eye before accepting, so `confirm` must state exactly
what they are being asked to vouch for.

**The target score never overrides this rule (JSV2S1060).** The pass bar is 90,
and it is a target rather than a gate: reporting a document at 86 is a correct
outcome. Inserting an achievement the master resume does not evidence in order
to reach 90 is not — it produces a CV that scores well and cannot survive the
interview it wins. If the recommendations you can honestly make do not reach
the bar, say so and stop. Never close the gap with something the candidate
would have to explain away.

## Applying an edit — why the text must be exact

Edits are applied by **literal string substitution**, with no model involved.
An approximate `before` is not found, and the edit is silently lost.

| `kind` | `before` | `after` | `anchorAfter` |
|---|---|---|---|
| `modify` | the exact existing text | the replacement | — |
| `insert` | `null` | the new bullet | the exact text to insert after |
| `delete` | the exact existing text | `null` | — |

`before` and `anchorAfter` must be copied **character for character** from the
CV you were given, including punctuation. Quote a whole bullet, never a
fragment — a fragment can match in two places.

## Output contract

Respond with a fenced `json` block, then at most 120 words of markdown. No
preamble.

```json
{
  "simg": {
    "baseline": { "ats": 0, "recruiter": 0, "hiringManager": 0 },
    "current": {
      "ats": { "score": 0, "note": "one line" },
      "recruiter": { "score": 0, "note": "one line" },
      "hiringManager": { "score": 0, "note": "one line" }
    },
    "keywords": {
      "mustHaveFound": 0, "mustHaveTotal": 0,
      "goodToHaveFound": 0, "goodToHaveTotal": 0,
      "missing": ["terms not present in the CV"]
    },
    "lineDelta": 0,
    "recommendations": [
      {
        "id": "r1",
        "lens": "ats | recruiter | hiring_manager",
        "kind": "modify | insert | delete",
        "points": 4,
        "text": "the instruction, one imperative sentence",
        "detail": "why it is worth these points, one sentence",
        "section": "the CV section it lands in",
        "before": "exact existing text, or null for an insert",
        "after": "exact replacement text, or null for a delete",
        "anchorAfter": "exact text to insert after, or null",
        "requiresConfirmation": false,
        "confirm": null
      }
    ]
  }
}
```

`lineDelta` is your own estimate of the net rendered-line change if the entire
worklist is accepted. It must be `<= lineBudget`. The application recomputes it
deterministically and will reject a worklist that overflows, so an optimistic
number costs the user the whole run.

Return **5 to 8 recommendations**. Fewer than five means the hiring-manager lens
was not worked hard enough; more than eight is a list nobody reads.

**Do not rewrite the CV.** One structured worklist, once. The revision is
produced by substitution from the accepted subset — that is the entire reason
the text must be exact.
