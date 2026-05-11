## VYBE Score (Snapchat Snapscore-style)

Add a persistent, ever-growing numeric score on every profile, displayed inline next to the username/stats — same vibe as Snapchat's Snapscore.

### How points accrue (Snapscore-inspired)

Every meaningful action grants points. Score only goes up, never down. Awarded server-side via a single RPC for consistency.

| Action | Points |
|---|---|
| Send a DM | +1 |
| Receive a DM | +1 |
| Post a Clip / video | +10 |
| Post a photo / regular post | +6 |
| Post a Story | +3 |
| Story view received | +1 (capped 50/story) |
| Receive a reaction/like | +1 |
| Give a reaction/like | +0.5 (rounded) |
| Comment posted | +2 |
| Receive a comment | +1 |
| Share sent | +2 |
| Receive a share | +3 |
| Save received | +4 |
| New follower | +5 |
| Daily login | +5 |
| Login streak day (per day) | +2 × streak (cap 30) |
| Friend added | +10 |
| Complete a challenge | +25 |
| First post of the day bonus | +15 |

Anti-abuse: 1-minute throttle per (user, action) for low-value events; daily caps on DM-spam (max 200 DM points/day) and reaction-give (max 100/day).

### Database

New table `vybe_scores`:
- `profile_id` (PK, FK profiles.id)
- `score` bigint default 0
- `last_action_at`, `updated_at`

New table `vybe_score_events` (audit + caps):
- `profile_id`, `action` text, `points` int, `created_at`
- Index on (profile_id, action, created_at) for cap windows
- 30-day retention via cron cleanup

RPC `award_vybe_points(_action text, _points int default null, _target_id uuid default null)`:
- SECURITY DEFINER, `SET search_path=public`
- Resolves caller profile_id from auth.uid()
- Applies action's default points if `_points` null
- Enforces per-action throttles & daily caps
- Inserts audit row, upserts `vybe_scores.score = score + points`
- Returns new score

RLS: `vybe_scores` global SELECT (USING true) so scores show on any profile; INSERT/UPDATE only via RPC. Events table: SELECT own only.

Backfill migration: seed initial score from existing data (posts × 6, followers × 5, comments × 2, capped reasonable) so existing users don't start at 0.

### Client wiring

New hook `src/hooks/useVybeScore.ts`:
- `useVybeScore(profileId)` — fetches score with React Query, 60s stale
- `useAwardVybePoints()` — mutation calling the RPC

Award integration points (fire-and-forget, debounced where noisy):
- `useDMConversations` / message send → `dm_send`
- Realtime new message received → `dm_receive`
- Post create flow (`Upload.tsx`, composer) → `post_create` (variant by media type)
- Story create → `story_create`
- Reaction add (`useReactions`) → `reaction_give`; trigger on receiver via DB trigger
- Comment create (`useComments`) → `comment_post` + receiver
- Share, Save, Follow → respective actions
- `useDailyLogin` → `daily_login` + streak bonus
- Challenge complete → `challenge_complete`

Most receiver-side awards are done via DB triggers (cleaner, can't be skipped):
- AFTER INSERT on `messages`, `reactions`, `comments`, `shares`, `saves`, `follows`, `post_views` (story) → call `award_vybe_points` for the recipient.

### UI

New component `src/components/profile/VybeScore.tsx`:
- Snapchat-style display: tiny ghost icon (use VYBE bolt/spark) + animated number
- Uses existing `AnimatedNumber` for satisfying tick-up
- Tap to open a sheet showing breakdown (today's gains, lifetime total, top-earning action) — like Snapchat's score popup
- Shows in `ProfileHeroCard` directly under username, replacing the implicit "engagement %" line for own profile (keeps `EngagementScore` ring on the Vibe Board)

Realtime: subscribe to `vybe_scores` row for the viewed profile so the number ticks up live when you DM/post.

Number formatting: raw up to 9,999, then `12.3K`, `1.2M` (Snapchat-style abbreviated).

### Files to add

- `supabase/migrations/<ts>_vybe_score.sql` (table, RPC, triggers, RLS, backfill)
- `src/hooks/useVybeScore.ts`
- `src/components/profile/VybeScore.tsx`

### Files to edit

- `src/components/profile/ProfileHeroCard.tsx` — render `<VybeScore />`
- `src/hooks/useDailyLogin.ts` — call RPC on login
- `src/hooks/useChallenges.ts` — call RPC on challenge claim
- Composer / `Upload.tsx` — call RPC on post create
- `src/hooks/useDMConversations.ts` (or send-message hook) — call RPC on send

### Out of scope

- Leaderboards (existing XP leaderboard already covers that)
- Score-based unlocks/perks (can come later)
- Score going down — strictly monotonic like Snapscore

Ready to build on approval.