import { z } from "zod";

/**
 * Server-side environment. Never import this from a client component.
 *
 * DATABASE_URL vs DIRECT_URL: Supabase exposes a transaction pooler (port 6543)
 * and a direct connection (port 5432). Serverless runtime uses the pooler with
 * `prepare: false`; drizzle-kit migrations need the direct connection.
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().min(1).optional(),

  /** Password gate for the deployed app (D3). Optional in local development. */
  APP_PASSWORD: z.string().min(1).optional(),

  /** D4. `mock` needs no Claude Code; `claude_local` requires the worker running. */
  AI_PROVIDER: z.enum(["mock", "claude_local", "gemini_api"]).default("mock"),

  /** Required for AI_PROVIDER=gemini_api. */
  GEMINI_API_KEY: z.string().min(1).optional(),
  /** Gemini model for scoring; discover names with `npm run ai:models`. */
  MODEL_SCORING_GEMINI: z.string().default("gemini-2.5-pro"),
  MODEL_CV_GEMINI: z.string().default("gemini-2.5-pro"),

  /** D5 — per-task models, deliberately configurable rather than hardcoded. */
  MODEL_SCORING: z.string().default("claude-sonnet-5"),
  MODEL_CV: z.string().default("claude-opus-5"),
  AI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),

  /**
   * C1 — RESOLVED 2026-08-29: 14 days, per the PRD's "2 weeks". The Analytics
   * document's 21 days is superseded. Drives the Pending view and Ghost Rate.
   */
  DEEMED_PENDING_DAYS: z.coerce.number().int().positive().default(14),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  // `.env.example` ships optional keys as FOO="" so they are visible but unset.
  // Without this, an empty string reads as "present but invalid" rather than
  // absent, and a fresh checkout fails on APP_PASSWORD before it ever starts.
  const source = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== ""),
  );

  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${detail}\n\nCopy .env.example to .env.local and fill it in.`,
    );
  }

  cached = parsed.data;
  return cached;
}
