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

    /**
     * One connection per instance, not five.
     *
     * A serverless instance serves one request at a time, so a pool larger than
     * one buys nothing and costs a great deal: Vercel runs many instances, each
     * held five connections, and Supabase's free tier runs out. It presented as
     * the app working, then freezing mid-navigation, then never loading —
     * because connection starvation is invisible until it is total.
     */
    max: 1,

    /**
     * Fail fast instead of hanging.
     *
     * Without this, a query that cannot get a connection waits indefinitely and
     * the page hangs with no error anywhere. Ten seconds turns a silent freeze
     * into a visible failure, which is the difference between a bug you can find
     * and one you can only guess at.
     */
    connect_timeout: 10,

    /** Return connections to the pooler quickly; instances are short-lived. */
    idle_timeout: 20,
    max_lifetime: 60 * 5,
  });
}

/**
 * Reuse the client across module evaluations.
 *
 * Cached in production too, not only in development. A warm serverless instance
 * re-evaluates modules more often than is obvious, and each fresh `postgres()`
 * opens another connection against a limit we have already proved is reachable.
 * The development case — surviving hot reloads — is the same mechanism.
 */
const sql = globalForDb.__jobscanSql ?? connect();
globalForDb.__jobscanSql = sql;

export const db = drizzle(sql, { schema });
export { schema };
