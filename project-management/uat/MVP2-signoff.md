# MVP2 (Phase 1.5) — UAT and sign-off

**Prepared 2026-09-05.** Nothing in this repository is committed; this pack
describes what to verify before it is.

## How to read this

Everything that a machine can decide, a machine has decided. The suites below
already run green, and re-running them is not your job:

| Check | Count | What it covers |
|---|---|---|
| `npm test` | **276** | Pure logic — no database, no spend |
| `npm run test:integration` | **33** | Live Supabase, mock AI provider |
| `npm run lint` · `npx tsc --noEmit` · `npm run build` | clean | — |

**What is left for you is what no test can assert: taste, truth, money and
production.** Four categories, and nothing else:

1. **Judgement** — is the output any *good*? A test can prove a CV changed; it
   cannot prove the change helped.
2. **Live providers** — every automated check runs on `AI_PROVIDER=mock`. The
   new SimG contract has never met a real model.
3. **Money** — only you can say whether a cost is worth paying.
4. **Domain truth** — whether a sponsor licence belongs to the employer you
   would actually apply to.

> **Before any of this: `AI_PROVIDER=live` spends real money.** UAT-1 to UAT-4
> together are roughly 3–5 billed calls. `npm run ai:bench` is separately billed
> and is *not* part of this pack.

---

## UAT-1 · SimG produces a worklist a real model can honour
**Stories:** JSV2S1058, JSV2S1057 · **Risk: high — never run live**

The whole design rests on the model quoting `before` text *verbatim*. If a live
model paraphrases, `validateRecommendations` discards the item and you get an
empty worklist. Mock fixtures quote perfectly by construction, so this is the
single biggest unknown in the release.

**Steps**
1. `AI_PROVIDER=live npm run dev`
2. Open an application with a real job description. Press **Generate CV**.
3. Wait — two calls now run: CVG, then SimG automatically.

**Sign off that:**
- [ ] A worklist appeared at all *(if empty, check the "N discarded as unapplicable" line — that is the paraphrasing failure)*
- [ ] Between 5 and 8 recommendations
- [ ] Each diff's red half is text you can actually find in the CV
- [ ] The points look proportionate — nothing trivial priced at 8
- [ ] `baseline → generated → current` reads plausibly *(is the untailored score really lower?)*

**Fails if:** more than ~2 recommendations were discarded. That means the prompt
needs to press harder on verbatim quoting.

---

## UAT-2 · Accepting an edit does the right thing to the document
**Stories:** JSV2S1126 · **Risk: medium — logic is tested, the *result* is not**

Automated tests prove substitution works and that `contentMd` is never mutated.
They cannot tell you whether the edited CV still reads like a person wrote it.

**Steps**
1. Accept the top recommendation. Then accept two more. Then **Undo** one.
2. Press **Download CV**.

**Sign off that:**
- [ ] The score rose by exactly the points shown, each time
- [ ] Undo restored the previous text exactly
- [ ] **The downloaded .docx contains the accepted edits** — screen and file agree
- [ ] The edited bullets read naturally; no doubled words, no broken sentences
- [ ] The .docx is still **one page** in Word
- [ ] **Accept all** — then read every inserted line and confirm each is true

**This is the one that matters most.** Accept-all can insert claims flagged
`requiresConfirmation`. You asked for the button unguarded and said you would
verify by eye; the amber "Verify before accepting" boxes are there so that is
possible. If those boxes are not obvious enough on screen, say so.

---

## UAT-3 · The sponsor register tells the truth about employers you care about
**Stories:** JSV2S1127 · **Risk: medium — 20 aliases verified mechanically, not by domain knowledge**

143,071 licences are loaded (register dated 2026-09-03). `npm run sponsors:audit`
proves each alias *exists in the register*. It cannot prove the alias names the
entity that would actually employ you.

**Steps** — run `npm run sponsors:audit`, then check the mappings against your
own knowledge of these employers.

**Sign off that:**
- [ ] `VISA → VISA EUROPE LIMITED` is the entity a London Visa PM role sits under
- [ ] `ADYEN → ADYEN N.V. LONDON BRANCH` — a *branch* licence is acceptable to you
- [ ] `KLARNA → Klarna Bank AB UK Branch` — same question
- [ ] `META/FACEBOOK → Facebook UK` — not "Meta Platforms UK"; confirm that is current
- [ ] You accept that **Apple, AWS, Nium and Thunes resolve to `none`** — they hold no licence under the names guessed, and I removed them rather than guess again

**Decide:** should a `none` result *reject* an application outright, or just
score low? Currently it scores low. Related to JSV2S1051, blocked on you.

---

## UAT-4 · The score is better than it was
**Stories:** JSV2S1127 · **Risk: low mechanically, high in value**

The measured failure: scoring Visa returned "no UK sponsor registry match" and
dropped the visa pillar 60 → 30, taking the score **75 → 59**.

**Steps** — re-score that same Visa job with `AI_PROVIDER=live`.

**Sign off that:**
- [ ] The score is now in the 70s, not the 50s
- [ ] The analysis cites the register rather than saying it could not find one
- [ ] ScoreG did **not** waste a search on sponsorship — the prompt tells it not to

---

## UAT-5 · Is SimG worth running every time?
**Stories:** JSV2S1058, JSV2S1142 · **Pure money decision — no test can make it**

The workspace now shows spend as **Job scoring / CV + cover letter / SimG
evaluation**, plus SimG's percentage share.

**Sign off that:**
- [ ] You have looked at SimG's share on a real application
- [ ] You accept it, **or** set `SIMG_AUTOMATIC = false` in `config/simg.ts`

**Open conflict, still yours:** CV and cover letter are shown as *one* line, not
two, because one CVG call produces both. Splitting them costs a second call —
paying for the skill and master resume twice, and letting the letter drift from
the CV. Confirm two lines is right (JSV2S1142).

---

## UAT-6 · Deployment
**Stories:** E8-T02, E8-T03 · **Not started — no code exists to test yet**

- [ ] Deploy to Vercel
- [ ] Password gate holds on the deployed URL
- [ ] Migrations `0005`–`0008` are present in the deployed environment

---

## Decisions still blocking, unchanged

These gate the rest of Phase 1.5 and no amount of testing moves them:

| ID | Decision |
|---|---|
| JSV2S1019 | Which Apify actor, and the budget ceiling |
| JSV2S1020 | Keywords, locations, recency, result cap |
| JSV2S1060 | SimG's pass bar — defaulted to 90 |
| JSV2S1051 | Visa evidence weights — now that the registry half is deterministic |
| JSV2S1053 | Domain skill set sign-off |
| JSV2S1050 | ScoreG locations |
| JSV2S1042 | Daily digest contents |
| JSV2S1137 | Does Apify spend share the AI ceiling? |
| JSV2S1142 | CV/CL as one cost line or two |
| JSV2S1145 | Recompute the deterministic third of the document score — free, offered, unanswered |
| JSV2S1146 | Drop Google Search grounding — needs a *paid* measurement |

---

## What I deliberately did not test for you

- **`npm run ai:bench`** — bills a real scoring call. Never run unattended.
- **The Apify path** — blocked on 1019/1020, and 1022 is blocked by the source
  itself (empty `applyUrl` on every row).
- **The daily digest** — no digest has ever been sent; needs deployment first.
- **Quality of ScoreG's reasoning** — outside this release's scope.
