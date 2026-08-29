# Exporting your Claude skills into JobScan

You already have a markdown file per skill. This says exactly where each one
goes and what the app does with it.

## Short answer

**Individual files, not one combined file.** Each task loads only the skill it
needs, so combining them would push irrelevant instructions into every prompt —
more tokens per call, and a worse result because the model sees a CV-optimiser
brief while scoring a job.

## Exact paths

Create these three. Names are matched literally by `lib/ai/prompts.ts`.

| Your file | Save it as | Loaded by |
|---|---|---|
| Job scorer skill | `prompts/scoreg/SKILL.md` | Job Score |
| CV optimiser skill (incl. Pass G) | `prompts/cvg/SKILL.md` | Resume **and** Cover Letter |
| Your master CV, in markdown | `prompts/master-resume.md` | all three tasks |

Optional, included when present:

| File | Purpose |
|---|---|
| `prompts/candidate-profile.md` | Standing context — target roles, locations, visa position, notice period |

```
prompts/
├── scoreg/
│   └── SKILL.md
├── cvg/
│   └── SKILL.md
├── master-resume.md
└── candidate-profile.md      (optional)
```

Copy them in with any editor, or:

```bash
mkdir -p prompts/scoreg prompts/cvg
cp ~/path/to/job-scorer.md      prompts/scoreg/SKILL.md
cp ~/path/to/cv-optimiser.md    prompts/cvg/SKILL.md
cp ~/path/to/master-resume.md   prompts/master-resume.md
```

## Notes on specific skills

**CV optimiser and Pass G.** One file, not two. Your CVG skill already runs the
adversarial pass internally — the PRD describes it as producing the CV and cover
letter and then applying an adversarial validation pass. Keep it that way: a
single `claude -p` invocation runs the whole workflow, and Pass G is mandatory
because it is part of the method rather than an optional extra step. If you
would rather Pass G were a separate, separately-costed call, say so — that is a
code change, not a prompt change.

**Resume and cover letter share `cvg/SKILL.md`.** The task instruction differs
(`lib/ai/prompts.ts`), the method does not. If your cover letter guidance lives
in a separate file, either append it to `cvg/SKILL.md` or tell me and I'll add a
`prompts/cvg/COVER-LETTER.md` lookup.

**Attachments.** If a skill references a scoring rubric, company registry or
example file, put it in the same folder and reference it by name from inside
`SKILL.md`. Only `SKILL.md` is read; anything it mentions must be inlined or
described, since the worker sends text rather than attaching files.

**Skills not needed yet.** Message generator (Phase 2, outreach), Technical Guru
and Case Study (Phase 3), Company Profile (not scoped). Leave them out for now.

## What the app builds around your file

Each prompt is assembled at enqueue time and frozen onto the job, so a replay
reproduces the same request:

```
You are executing a saved JobScan workflow. Follow the method exactly.

# Method                    <- your SKILL.md, verbatim
# Candidate master resume   <- your master-resume.md, verbatim
# Candidate profile         <- optional, if present
# Task                      <- one line: score / tailor CV / write cover letter
## Job                      <- title, company, location, URL, full JD
## Output contract          <- see below
```

## Output contract

The app appends this. Your skill's output should be compatible, or the
structured fields are lost:

````
```json
{
  "score": 0-100,
  "matchCategory": "perfect_match" | "dicey_match" | "rejection_pool",
  "visaSignal": "short phrase describing sponsorship evidence",
  "analysis": {
    "summary": "one paragraph",
    "strengths": ["..."],
    "gaps": ["..."],
    "visaSignals": ["..."],
    "breakdown": { "dimension": "score or note" }
  }
}
```
````

…followed by the readable document as markdown.

The JSON block populates the score, match category, visa signal and the
strengths/gaps panels. The markdown becomes the stored, downloadable document.

**A response with no JSON block still produces a usable document** — only the
structured fields are lost. So if your skills already have a fixed output format
you would rather keep, they will still work; you would just lose the numeric
score on the dashboard. If that happens, tell me and I'll adapt the contract in
`lib/ai/prompts.ts` to match your existing format instead.

## Then run it

```bash
npm i -g @anthropic-ai/claude-code    # must be on PATH, or set CLAUDE_BIN
```

Set `AI_PROVIDER="claude_local"` in `.env.local`, then:

```bash
npm run dev            # terminal 1
npm run worker         # terminal 2
```

Open an application, click **Generate score**. The chip moves
`queued → running → succeeded`, and the result appears on the next page load.

```bash
npm run ai:report      # measured tokens and cost per job
```

Nothing is charged on the Pro subscription — the report shows what the same work
would cost on the metered API, and how hard each run draws on your allowance.
