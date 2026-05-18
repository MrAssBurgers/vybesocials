## What's actually happening

Publishing is failing because the **Test database is out of connection slots**, not because of a code or migration bug.

Every connection attempt — including the ones the publish pipeline makes to verify the schema — is being rejected with:

```
FATAL: 53300: remaining connection slots are reserved for roles with the SUPERUSER attribute
```

This is showing up continuously in Postgres logs (dozens of FATALs per minute, ongoing right now). It's why:
- The schema metadata fetch in this session failed
- `read_query` returns the same error
- Publishing can't complete its pre-flight DB checks

Production (Live) reports healthy, but publish has to touch Test first, so the whole pipeline stalls.

## Root cause

Something is holding too many open Postgres connections on the Test instance and never releasing them. The pool is saturated, so any new role (including the migration runner) gets refused. Common culprits in this codebase:

1. An edge function calling `createClient(...)` inside the request handler and not closing it — every invocation leaks one connection.
2. A recently deployed edge function with a hot loop / cron that opens connections faster than they idle out.
3. Long-lived realtime subscriptions or admin tools holding sessions open.

## Plan

### Step 1 — Free the pool (immediate unblock)
Ask the user to **pause and resume the Test backend** from Lovable Cloud settings. This forcibly drops all existing Postgres connections and resets the pool. Within ~30 seconds the publish pipeline should succeed.

If pause/resume isn't accessible, the alternative is to wait ~5–10 minutes for idle connections to time out, then retry publish.

### Step 2 — Verify the unblock
After resume, re-run `cloud_status` + a trivial `SELECT 1`. Both should succeed cleanly. Then retry publish.

### Step 3 — Audit edge functions for connection leaks (prevent recurrence)
Once Test is breathing again, grep every edge function for:

- `createClient(` calls made **inside** the request handler (should be module-scope, created once per cold start).
- Any function using `postgres`, `pg`, or raw connection libraries instead of the Supabase JS client.
- Recently added/edited functions (Spotify control, push notifications, ai-catch-up, analyze-bug-report — these were touched today).

Fix any that instantiate clients per-request. Move the `createClient` call to module scope so it's reused across invocations on the same warm instance.

### Step 4 — Add a guard (optional, recommended)
Add lightweight logging on the top 3–5 most-invoked edge functions so we can see invocation rate and catch leaks earlier next time.

## Technical detail

- Error code `53300` = `too_many_connections`.
- Lovable Cloud Test runs with a small connection ceiling; the reserve for SUPERUSER is what migrations need, so once the regular pool is full publishing breaks first.
- Pause/resume is safe — no data loss, only kicks active sessions.
- No migration is needed for this fix; it's an operational + edge-function hygiene issue.

## What I need from you to proceed

Confirm you want me to (a) walk you through pause/resume, and then (b) audit the edge functions touched today for connection leaks. I'll implement step 3 once Test is responsive again.
