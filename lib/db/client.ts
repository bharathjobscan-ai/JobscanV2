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
     * Sized for Vercel's Fluid Compute, which runs several concurrent requests
     * per instance rather than one.
     *
     * The first attempt at this bug set `max: 1` on the reasoning that a
     * serverless instance serves one request at a time. Under Fluid that is
     * false, and a pool of one makes things *worse*: concurrent requests queue
     * behind a single connection, and postgres.js has no pool-acquire timeout,
     * so one slow query blocks every other request on that instance
     * indefinitely. Three is enough for real concurrency and still an order of
     * magnitude below the free-tier ceiling.
     */
    max: 3,

    /**
     * The important one. Everything else is tuning; this is what stops a hang.
     *
     * Postgres aborts any statement running longer than this, server-side. It
     * turns "the page never responds and nothing appears in any log" into an
     * error with a stack trace. The original symptom — production loading, then
     * freezing mid-navigation, then serving nothing — was invisible precisely
     * because no timeout existed anywhere in the path.
     */
    connection: {
      statement_timeout: 15_000,
      idle_in_transaction_session_timeout: 15_000,
    },

    /** Fail fast when the pooler itself is unreachable. */
    connect_timeout: 10,

    /** Hand connections back to the pooler promptly; instances are ephemeral. */
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
