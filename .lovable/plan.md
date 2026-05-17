# Daily Brief & Challenges — Auto-Generation on Live

## Problems found

**Challenges (Live DB check):**
- Daily challenges missing for May 13, 14, 15 (gaps). Cron runs at `0 0 * * *` UTC, but when the AI call fails the fallback `rotate_challenges` sometimes doesn't get invoked (HTTP timeouts via pg_net leave no retry).
- Weekly set for week of May 4 has 30 rows — duplicate runs piling up.
- Cleanup runs only once a day at 00:05 UTC and uses `CURRENT_DATE`, so a daily challenge for "May 17 UTC" is deactivated at midnight UTC even though users in UTC-12 still have ~12 hours left, and users in UTC+14 have been on "May 18" for 14 hours with no fresh set.

**Daily Brief (Live):**
- Push notifications fire on cron (morning/lunch/dinner) ✅ working.
- Brief *content* is only generated on-demand client-side (`useBriefPreFetch`) — so users who haven't opened the app recently get an empty/stale brief when they tap the push.

---

## Plan

### 1. Challenge generation — bulletproof + timezone-safe

**A. Pre-generate the next UTC day at UTC+14 boundary**
Add a new cron at `0 10 * * *` UTC (= midnight UTC+14, Kiribati) that calls `generate-challenges` with `target_date = tomorrow_utc`. Update the edge function to accept a `target_date` / `target_week_start` body param. This guarantees a fresh set exists the moment any timezone on Earth rolls into the new day.

Keep the existing `0 0 * * *` UTC run as a backup for the UTC day itself.

**B. Hourly SQL safety net (no AI, no network)**
New cron `0 * * * *` that runs a new RPC `ensure_active_challenges()`:
- Looks at today's UTC date AND tomorrow's UTC date
- For each, if `< 6` active daily challenges exist, inserts from `challenge_templates` (random pick, dedup by title)
- Same for current and next ISO week
- Pure SQL, can't fail from rate limits — closes the gap that caused May 13-15 to be empty

**C. Global-aware cleanup**
Rewrite `cleanup_stale_challenges()`:
- Deactivate a daily challenge only when `now() AT TIME ZONE 'UTC' > (active_date + 1) + interval '12 hours'` — i.e., once UTC-12 has finished that day
- Deactivate a weekly challenge only when `now() > (active_week_start + 7) + interval '12 hours'`
- Delete (hard purge) dailies older than 8 days and weeklies older than 29 days
- Also dedup: delete duplicate-title rows for the same `(type, active_date)` / `(type, active_week_start)` keeping the oldest
Move cleanup cron to `0 13 * * *` UTC (1pm, after the UTC-12 grace period for the prior day).

**D. Stop duplicate weekly piles**
In `generate-challenges/index.ts`, before inserting weeklies, check if `>= 6` active rows already exist for the target week and skip inserting (or replace-not-add). Today's "deactivate then insert" still piles up old `is_active=false` rows that the new cleanup will purge.

### 2. Daily Brief — server-side pre-warming

**New table `daily_brief_cache`** (per user, per slot):
- `user_id`, `slot` (`morning` | `lunch` | `dinner`), `payload jsonb`, `generated_at`, `expires_at`
- Unique on `(user_id, slot)`
- RLS: users read their own row only

**New edge function `prewarm-daily-briefs`**:
- Selects active opted-in users (have `notification_preferences.system_enabled = true` AND logged in within last 14 days)
- For each, calls the same brief logic as `ai-catch-up` (refactor shared logic into `_shared/generateBrief.ts`) and upserts into `daily_brief_cache`
- Throttled in batches of 25 with a small delay to respect AI gateway limits

**Cron**: run at `30 5 * * *`, `30 11 * * *`, `30 17 * * *` UTC (30 min before each push fan-out so content is ready when the push lands).

**Client (`useBriefPreFetch` / brief page)**: try `daily_brief_cache` first via Supabase select; fall back to existing on-demand `ai-catch-up` call if no row or stale.

**Cleanup**: same RPC that purges challenges also deletes `daily_brief_cache` rows where `expires_at < now() - 1 day`.

### 3. Apply on Live

Migrations and edge function updates apply to Test on save; on publish they roll to Live. New cron jobs are inserted via the Supabase insert tool (so they don't carry over on remix) and will target the Live project URL.

---

## Technical summary

**Files**:
- `supabase/functions/generate-challenges/index.ts` — accept `target_date` / `target_week_start`, idempotent weekly insert
- `supabase/functions/_shared/generateBrief.ts` *(new)* — extracted from `ai-catch-up`
- `supabase/functions/ai-catch-up/index.ts` — use shared module
- `supabase/functions/prewarm-daily-briefs/index.ts` *(new)*
- `src/hooks/useBriefPreFetch.ts` and `src/pages/BriefPage.tsx` — read from `daily_brief_cache` first

**Migration**:
- `daily_brief_cache` table + RLS
- Rewrite `cleanup_stale_challenges()` (timezone-safe boundaries + dedup)
- New `ensure_active_challenges()` RPC

**Cron (via supabase insert on Live)**:
- `generate-daily-challenges-next-utc` — `0 10 * * *` → generate tomorrow_utc
- `generate-weekly-challenges-next-utc` — `0 10 * * 0` → generate next ISO week (Sun 10:00 UTC = Mon 00:00 UTC+14)
- `ensure-active-challenges-hourly` — `0 * * * *`
- `cleanup-stale-challenges` — move to `0 13 * * *`
- `prewarm-briefs-morning` — `30 5 * * *`
- `prewarm-briefs-lunch` — `30 11 * * *`
- `prewarm-briefs-dinner` — `30 17 * * *`

No destructive data ops — only adds rows/jobs and rewrites the cleanup function (still preserves all in-flight data due to wider boundaries).
