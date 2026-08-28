# ADR-0004 — Hosting, data access and the password gate

**Status:** Accepted · **Date:** 2026-08-29

## Hosting

Vercel free tier, Supabase free Postgres. Chosen over local-only so the
dashboard is reachable from any device.

## Access control

The app sits on a public URL and holds personal job-search data, so it cannot be
world-readable. Phase 1 uses a **single shared password** enforced in `proxy.ts`
(Next.js 16 renamed the `middleware` convention to `proxy`).

The cookie stores `sha256("jobscan:" + password)`, not the password, so a leaked
cookie does not hand over the secret in plain text. Web Crypto is used so the
same helper (`lib/auth.ts`) works in the edge proxy and in the login server
action.

With `APP_PASSWORD` unset the gate is skipped — convenient locally, and the
deployment checklist marks it **required on Vercel**.

This is deliberately not Supabase Auth: single user, no sign-up, no roles, no
password reset. Revisit only if the tool gains a second user.

## Data access

All database access is server-side, through Drizzle over the `postgres` driver.

**supabase-js is not used for data.** Consequences:

- Supabase keys never reach the browser, so RLS stays trivial rather than being
  the only thing between the internet and the data.
- One way to read and write, so there is no second query path to audit.
- supabase-js returns only if Storage is needed (deferred — see
  [ADR-0003](0003-data-model.md)).

## Two connection strings

A recurring Supabase footgun, so it is explicit in `.env.example`:

| Var | Port | Used by |
|---|---|---|
| `DATABASE_URL` | 6543, transaction pooler | app runtime, including Vercel |
| `DIRECT_URL` | 5432, direct | `drizzle-kit` migrations, the worker |

The client sets `prepare: false` because the transaction pooler cannot hold
prepared statements across pooled connections. Running DDL through the pooler
fails in confusing ways, which is why migrations use `DIRECT_URL`.

## Known operational quirk

Supabase free projects pause after prolonged inactivity. For a tool used in
bursts this will be noticed as a cold first request. Verify the current terms at
signup rather than designing around a remembered number.
