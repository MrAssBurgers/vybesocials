## Issues found

### 1. Reports + post deletions never reach the admin panel
- `reports` table is **empty in the database** (0 rows) — so when you tap "Report", the insert is silently failing. `PostCard.handleReport` and `ShortCard` both call `supabase.from('reports').insert(...)` but **never read the `error` field**, so RLS failures show "Reported!" toast even when nothing was saved. We never see the real error.
- Post deletions are not logged anywhere — there is no admin audit feed for who deleted what, so you can't review them.

### 2. Email 2FA toggle reverts to off
- DB function `update_2fa_settings` and RLS look correct.
- Bug is in `SecuritySection.load()`: when `ensure_2fa_settings` returns the existing row, it reads `Array.isArray(s) ? s[0] : s` but the toggle ignores the `email_2fa_enabled` field if it's stored as `false` due to a stale settings row. The likelier cause: the toggle is wired to a backing row that the **server flips back off** because the email-send step fails (we hard-error in the live login flow and the row gets rolled back). Need to verify the row actually persists in `user_2fa_settings`.

### 3. Reactions revert to 👍 after refresh
**Confirmed root cause** (verified in DB):
- `PostCard.tsx` line 332: `(post as any).reaction_type as ReactionType || 'like'`
- But the feed RPCs `get_ranked_feed` and `get_trending_feed` **do not return a `reaction_type` column** (verified via `pg_get_function_result`). Only `is_liked` exists.
- So every refresh, `reaction_type` is `undefined` → falls back to `'like'` (👍), even though the real reaction in `likes.reaction_type` is `'love'`/`'haha'`/etc.

### 4. Spotify "Listening" UI never appears
- `NowPlayingInline` only renders when `live_music_presence.is_playing && title` are set.
- `useSpotifyPresence` polls the `spotify-now-playing` edge function every 15s but swallows all errors. If the function is failing (token refresh / RLS on `live_music_presence` upsert), nothing is ever written, so the badge never renders.

---

## Plan

### Step 1 — Make reports actually save and become visible to admins
- In `src/components/posts/PostCard.tsx` and `src/components/posts/ShortCard.tsx`, change `handleReport` to:
  - Destructure `{ error }` from the insert and surface the real error in a toast.
  - Also write the `reported_user_id` (post author) so admins can filter by reported user.
- Add a `post_deletion_log` table (id, post_id, author_id, deleted_by, reason, created_at) + RLS:
  - Authenticated users: INSERT only their own deletions (`deleted_by = current_profile_id()`).
  - Admins/moderators: SELECT all.
- In both `PostCard` and `ShortCard` delete handlers, insert a row into `post_deletion_log` right before/after deleting the post.
- Add a small "Deleted Posts" tab to `AdminReportsSection` (or a new section) showing the log.

### Step 2 — Make 2FA toggle persist
- In `SecuritySection.tsx`, after `updateSetting`, re-call `load()` from the DB instead of trusting the RPC's returned row (defensive resync).
- Verify in the DB after toggling — if the row is correct but UI shows off, the bug is `load()` race; if the row itself is wrong, fix `update_2fa_settings` to not coalesce `NULL → existing` when the caller explicitly passes `false`.
- Most likely fix: change the RPC to use the parameter value directly (`SET email_2fa_enabled = p_email_2fa`) instead of `COALESCE(EXCLUDED.email_2fa_enabled, ...)` which keeps the old value when caller passes `false`.

### Step 3 — Persist per-post reaction across refresh
- Update the `get_ranked_feed` and `get_trending_feed` SQL functions to also return `reaction_type text` (LEFT JOIN `likes` on `(post_id, user_id)` filtered by current viewer).
- Update `useInfinitePosts.ts` mapping to pass through `reaction_type` (it already does — only the RPC payload is missing it).
- Alternative (no migration): in `useInfinitePosts.ts`, after the RPC returns, run a second `supabase.from('likes').select('post_id, reaction_type').in('post_id', ids).eq('user_id', profile.id)` and merge — same pattern `usePosts.ts` already uses. Lighter touch, no DB change.
- Recommendation: use the lighter client-side merge to avoid changing the RPC signature.

### Step 4 — Surface Spotify now-playing
- Add error logging in `useSpotifyPresence` (currently swallowed) so we can see what `spotify-now-playing` is returning.
- Check edge-function logs for `spotify-now-playing` to see if token refresh is failing or `live_music_presence` upsert is being blocked by RLS.
- Verify `live_music_presence` RLS allows the edge function (using service role) to upsert and allows authenticated users to SELECT any user's row (needed for `useLiveMusicPresence` to show your music to your friends).
- Fix whichever of those is broken; the UI already works the moment a row exists.

### Files I'll touch
- `src/components/posts/PostCard.tsx` (report error handling, deletion log insert)
- `src/components/posts/ShortCard.tsx` (same)
- `src/components/settings/SecuritySection.tsx` (reload after save)
- `src/hooks/useInfinitePosts.ts` (merge reaction_type from `likes`)
- `src/hooks/useSpotifyPresence.ts` (log errors)
- New migration: `post_deletion_log` table + RLS, and fix `update_2fa_settings` COALESCE bug
- `src/components/admin/sections/AdminReportsSection.tsx` (add Deleted Posts tab)
- Possibly `supabase/functions/spotify-now-playing/index.ts` depending on log findings

### Out of scope
- Not changing the actual report/delete UX flow (still uses the same prompts).
- Not adding new reaction types or admin actions beyond viewing.
