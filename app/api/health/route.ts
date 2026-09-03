import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { getEnv } from "@/lib/config/env";

export const dynamic = "force-dynamic";

/**
 * Diagnostics for a production that will not load.
 *
 * The freeze that prompted this was invisible: no error, no log line, just a
 * page that never responded. This endpoint makes the two candidate causes
 * answerable in one request — can the app reach the database, and is its
 * configuration complete — without ever revealing a credential.
 *
 * **Values are never returned, only whether a key is set.** A health check that
 * leaks a connection string is a worse problem than the one it diagnoses.
 */
type Check = { ok: boolean; ms: number; detail?: string };

async function timed(label: string, run: () => Promise<unknown>): Promise<Check> {
  const started = Date.now();
  try {
    await run();
    return { ok: true, ms: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - started,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET() {
  const started = Date.now();

  // Read env first: if this throws, the database was never the problem.
  let env: ReturnType<typeof getEnv> | null = null;
  let envError: string | null = null;
  try {
    env = getEnv();
  } catch (error) {
    envError = error instanceof Error ? error.message : String(error);
  }

  const checks: Record<string, Check> = {};

  if (env) {
    checks.ping = await timed("ping", () => db.execute(sql`select 1`));

    // A trivial select proves connectivity; a real count proves the schema the
    // failing pages actually depend on.
    if (checks.ping.ok) {
      checks.schema = await timed("schema", () =>
        db.execute(sql`select count(*) from raw_jobs where prequalification is not null`),
      );
      checks.ingestionRuns = await timed("ingestionRuns", () =>
        db.execute(sql`select count(*) from ingestion_runs`),
      );
    }
  }

  const healthy = envError === null && Object.values(checks).every((c) => c.ok);

  return Response.json(
    {
      healthy,
      totalMs: Date.now() - started,
      env: envError
        ? { ok: false, error: envError }
        : {
            ok: true,
            // Presence only. Never the value.
            DATABASE_URL: Boolean(env?.DATABASE_URL),
            DIRECT_URL: Boolean(env?.DIRECT_URL),
            APP_PASSWORD: Boolean(env?.APP_PASSWORD),
            GEMINI_API_KEY: Boolean(env?.GEMINI_API_KEY),
            ANTHROPIC_API_KEY: Boolean(env?.ANTHROPIC_API_KEY),
            APIFY_TOKEN: Boolean(env?.APIFY_TOKEN),
            AI_PROVIDER: env?.AI_PROVIDER,
            // Port 6543 is Supabase's transaction pooler, 5432 the direct
            // connection. The direct one caps far lower and is not meant for
            // serverless — a frequent cause of exactly this failure.
            usesPooler: env?.DATABASE_URL.includes(":6543") ?? false,
          },
      checks,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      region: process.env.VERCEL_REGION ?? "local",
    },
    { status: healthy ? 200 : 503 },
  );
}
