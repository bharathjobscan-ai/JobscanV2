import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import { getEnv } from "@/lib/config/env";

/**
 * Single server-side data path.
 *
 * We deliberately do not use supabase-js for data access: everything goes
 * through Drizzle over the Postgres connection, server-side only. Supabase keys
 * never reach the browser, so RLS stays trivial and there is one way to read
 * and write. supabase-js comes back only if/when Storage is needed.
 *
 * `prepare: false` is required for Supabase's transaction pooler, which cannot
 * hold prepared statements across pooled connections.
 */
const globalForDb = globalThis as unknown as {
  __jobscanSql?: ReturnType<typeof postgres>;
};

function connect() {
  const env = getEnv();
  return postgres(env.DATABASE_URL, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
  });
}

// Reuse the connection across hot reloads in development.
const sql = globalForDb.__jobscanSql ?? connect();
if (process.env.NODE_ENV !== "production") {
  globalForDb.__jobscanSql = sql;
}

export const db = drizzle(sql, { schema });
export { schema };
