# Deploying to Vercel

## The blocker that isn't obvious

`lib/ai/prompts.ts` and the upload-template route read files from disk at
runtime via `process.cwd()`. **Next.js traces static imports, not dynamic path
reads**, so without configuration the serverless bundle omits `prompts/` and
`config/` entirely.

The failure only appears once deployed — locally the files are simply there —
and it looks like a missing-prompt error rather than a packaging problem.
`outputFileTracingIncludes` in `next.config.ts` fixes it. If you add another
runtime file read, add its directory there too.

## Environment variables

Set these in **Project Settings → Environment Variables**. Everything else has a
working default.

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | Supabase **transaction pooler**, port 6543 | Serverless needs the pooler, not a direct connection |
| `APP_PASSWORD` | a strong password | **Required.** Without it the gate is skipped and your job-search data is public |
| `AI_PROVIDER` | `live` | `mock` deploys fine but generates nothing real |
| `PROVIDER_SCORING` | `gemini_api` | |
| `PROVIDER_CV` | `anthropic_api` | |
| `GEMINI_API_KEY` | from aistudio.google.com | |
| `ANTHROPIC_API_KEY` | from console.anthropic.com | |

`DIRECT_URL` is **not** needed on Vercel — it exists only for `drizzle-kit`
migrations, which you run locally.

## Deploying

```bash
npx vercel          # first run links the project and prompts for login
npx vercel --prod
```

Or import the GitHub repo at [vercel.com/new](https://vercel.com/new); pushes to
`main` then deploy automatically.

## What runs where

Everything runs on Vercel. Both AI providers are plain HTTPS calls, so
generation happens inside the request — there is no worker and no queue to
drain. The only local-only command is `npm run db:migrate`, which needs
`DIRECT_URL`.

## After deploying, check

1. The password gate rejects a wrong password.
2. The dashboard lists applications — proves `DATABASE_URL` reached the pooler.
3. **Generate a score.** This is the real test of the file-tracing fix: if
   `prompts/` did not ship, it fails with `MissingPromptError` naming the file.
4. Download the upload template — proves `config/` shipped.
5. Download a `.docx` — proves the renderer works in the serverless runtime.

## Known operational notes

**Supabase free projects pause after prolonged inactivity.** The first request
after a quiet spell is slow, or fails and succeeds on retry.

**Function duration.** Scoring with Google Search grounding took ~84s measured.
Vercel's Hobby tier caps serverless execution well below that, so a score
triggered from the deployed app may time out even though the same call succeeds
locally. If it does, the options are a paid tier for a longer limit, or moving
generation to a background job that the page polls. Worth testing before relying
on it — this is the most likely remaining deployment surprise.

**Secrets.** `.env.local` is git-ignored and never leaves your machine. Vercel
holds its own copy; changing one does not change the other.
