#!/usr/bin/env node
/**
 * JobScanV2 local AI worker (D4).
 *
 * Vercel cannot spawn Claude Code, so the app enqueues rows in `ai_jobs` and
 * this script — running on your Mac, signed in to Claude Pro — claims them,
 * runs `claude -p`, and writes the raw response back.
 *
 * It deliberately performs NO domain writes. Turning a response into a
 * document, a score and a timeline event happens in features/ai/tasks.ts
 * (settleAiJobs), which runs when the app next loads the page. That is why this
 * file can be small, dependency-light plain JS with raw SQL instead of a second
 * copy of the application's write path.
 *
 *   node workers/ai/run.mjs          # poll forever
 *   node workers/ai/run.mjs --once   # drain the queue and exit
 *
 * Effort: Claude Code takes its effort level from ~/.claude/settings.json
 * (`effortLevel`), not from a per-invocation flag. AI_EFFORT is recorded on the
 * row for provenance only.
 */
import { spawn } from "node:child_process";
import process from "node:process";

import postgres from "postgres";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Already exported, or running in CI.
}

const DATABASE_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DIRECT_URL or DATABASE_URL must be set. See .env.example.");
  process.exit(1);
}

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 10_000);
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const EXTRA_ARGS = (process.env.CLAUDE_EXTRA_ARGS ?? "").split(" ").filter(Boolean);
const MAX_ATTEMPTS = 3;
const STALE_MINUTES = 15;
const ONCE = process.argv.includes("--once");

const sql = postgres(DATABASE_URL, { prepare: false, max: 2 });

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

/**
 * Claim one job atomically.
 *
 * FOR UPDATE SKIP LOCKED means a second worker (or a second run started by
 * mistake) can never pick up the same row.
 */
async function claimJob() {
  const rows = await sql`
    update ai_jobs
       set status = 'running',
           started_at = now(),
           attempts = attempts + 1
     where id = (
       select id from ai_jobs
        where status = 'queued'
        order by queued_at
        limit 1
        for update skip locked
     )
    returning id, application_id, task_type, model, prompt, attempts
  `;
  return rows[0] ?? null;
}

/** Recover rows abandoned by a crashed worker. */
async function requeueStale() {
  const rows = await sql`
    update ai_jobs
       set status = case when attempts >= ${MAX_ATTEMPTS} then 'failed' else 'queued' end,
           error = case when attempts >= ${MAX_ATTEMPTS}
                        then 'Abandoned after ' || attempts || ' attempts (worker stopped mid-run)'
                        else error end,
           finished_at = case when attempts >= ${MAX_ATTEMPTS} then now() else null end
     where status = 'running'
       and started_at < now() - make_interval(mins => ${STALE_MINUTES})
    returning id
  `;
  if (rows.length > 0) log(`requeued ${rows.length} stale job(s)`);
}

/** Run Claude Code headless. Prompt goes over stdin to avoid arg-length limits. */
function runClaude(prompt, model) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "json"];
    if (model) args.push("--model", model);
    args.push(...EXTRA_ARGS);

    const child = spawn(CLAUDE_BIN, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", (error) => {
      reject(
        error.code === "ENOENT"
          ? new Error(
              `Could not find "${CLAUDE_BIN}". Install it with ` +
                `\`npm i -g @anthropic-ai/claude-code\`, or set CLAUDE_BIN to its full path.`,
            )
          : error,
      );
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr.trim() || "no stderr"}`));
        return;
      }
      resolve(extractText(stdout));
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** `--output-format json` wraps the answer; fall back to raw stdout. */
function extractText(stdout) {
  const trimmed = stdout.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed?.result === "string") return parsed.result;
    if (Array.isArray(parsed)) {
      const last = parsed.filter((m) => typeof m?.result === "string").pop();
      if (last) return last.result;
    }
  } catch {
    // Not JSON — the CLI printed plain text.
  }
  return trimmed;
}

async function processOne() {
  const job = await claimJob();
  if (!job) return false;

  log(`▶ ${job.task_type} ${job.id} (attempt ${job.attempts}, model ${job.model})`);

  if (!job.prompt) {
    await sql`
      update ai_jobs
         set status = 'failed', error = 'No prompt stored on this job', finished_at = now()
       where id = ${job.id}
    `;
    return true;
  }

  try {
    const text = await runClaude(job.prompt, job.model);
    if (!text.trim()) throw new Error("Claude returned an empty response");

    await sql`
      update ai_jobs
         set status = 'succeeded',
             result = ${sql.json({ text })},
             error = null,
             finished_at = now()
       where id = ${job.id}
    `;
    log(`✔ ${job.task_type} ${job.id} (${text.length} chars)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const giveUp = job.attempts >= MAX_ATTEMPTS;

    await sql`
      update ai_jobs
         set status = ${giveUp ? "failed" : "queued"},
             error = ${message},
             finished_at = ${giveUp ? sql`now()` : null}
       where id = ${job.id}
    `;
    log(`✖ ${job.task_type} ${job.id}: ${message}${giveUp ? " (giving up)" : " (will retry)"}`);
  }

  return true;
}

async function main() {
  log(`worker started — polling every ${POLL_MS}ms, claude binary "${CLAUDE_BIN}"`);

  let running = true;
  const stop = () => {
    if (!running) return;
    running = false;
    log("shutting down…");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (running) {
    try {
      await requeueStale();
      // Drain the queue before sleeping.
      while (running && (await processOne())) {
        /* keep going */
      }
    } catch (error) {
      log("worker error:", error instanceof Error ? error.message : error);
    }

    if (ONCE) break;
    if (!running) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  await sql.end({ timeout: 5 });
  log("stopped");
}

main().catch(async (error) => {
  console.error(error);
  await sql.end({ timeout: 5 });
  process.exit(1);
});
