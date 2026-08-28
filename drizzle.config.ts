import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so .env.local is not loaded for us.
// process.loadEnvFile is built into Node — no dotenv dependency needed.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Fine when the vars are already exported (CI, or an explicit `export`).
}

/**
 * Migrations must use DIRECT_URL (port 5432), not the transaction pooler.
 * Running DDL through the pooler is the classic Supabase footgun.
 */
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DIRECT_URL (preferred) or DATABASE_URL must be set. Copy .env.example to .env.local.",
  );
}

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
