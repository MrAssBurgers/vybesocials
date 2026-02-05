
Goal: Restore DM reliability (send/receive text + VYBE snaps + media), fix core DM mechanics (unsend/delete/etc.), restore calls, and make challenges/XP actually work again with no refresh.

What I found (root causes)
1) Messages are failing at the database level due to a trigger that tries to queue an HTTP request with a NULL URL
- There is a trigger `on_message_insert_notify` on `public.messages` that calls `public.notify_message_recipients()`.
- That function uses `net.http_post(url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-push-notification', ...)`.
- In this environment, those settings are NULL:
  - `current_setting('app.settings.supabase_url', true)` = NULL
  - `current_setting('app.settings.service_role_key', true)` = NULL
- Result: Postgres error “null value in column "url" of relation "http_request_queue" violates not-null constraint”, which can abort the message INSERT. That explains “can’t send anything”.

2) Media/VYBE uploads likely fail because file paths were changed to use `profile.id/…`, but storage upload policy requires `auth.uid()` folder
- Storage policy for `chat-media` bucket: `auth.uid()::text = (storage.foldername(name))[1]`
- That means upload paths must be `${authUserId}/...` (typically `profile.user_id`), not `${profile.id}/...`.
- So even if text messages start working again, snaps/images/audio/video can still fail until we revert to auth-based paths.

3) Challenges/XP are broken by mixed “profile id” vs “auth id” usage plus incorrect RLS on challenge_progress
- `challenge_progress.user_id` references `profiles.id`, but its RLS policies currently check `auth.uid() = user_id`, which will never match.
- `user_levels.user_id` and `challenge_rewards.user_id` reference auth users, but the frontend `useVybePass` is querying/inserting using `profile.id` (causing FK errors like `user_levels_user_id_fkey`).
- `sync_my_challenge_progress()` currently selects `profiles WHERE id = auth.uid()` (incorrect) and inserts `challenge_rewards` using a profile id (incorrect for that FK). That can make “Sync” and progression appear broken.

Plan (implementation steps)

A) Hotfix: Make message INSERTs impossible to break (backend migration)
1) Patch `public.notify_message_recipients()` so it can never fail the message insert:
   - If required settings are missing, do nothing and immediately `RETURN NEW`.
   - Wrap `net.http_post` call in a `BEGIN … EXCEPTION WHEN OTHERS THEN … END;` so any networking/queue error is swallowed.
   - This keeps messaging functional even if push is misconfigured.
2) (Optional but recommended) Temporarily disable the `on_message_insert_notify` trigger entirely (or keep it enabled but safe as above).
   - The app already sends pushes client-side; DB-level push should never block chats.

B) Fix DM media + VYBE snap sending paths (frontend)
1) Revert all `chat-media` upload fileName paths to use the authenticated user id folder:
   - Use `${profile.user_id}/${Date.now()}...` everywhere we upload to `chat-media`.
   - This applies to:
     - VYBE image/video sends in `ChatView`
     - Image upload flow (safety gate approved image)
     - Voice messages
     - Video sends in `useInstantSend.sendVideo`
2) Add a clear guard:
   - If `!profile?.user_id`, show a toast like “Account not ready yet, please retry” and block upload (prevents silent failures).

C) Fix “can’t receive messages / realtime feels dead” (frontend + backend sanity)
1) Ensure realtime tables are in the publication (they are already: messages, conversations, calls, etc.). Keep as-is.
2) After message INSERTs stop failing (Step A), verify the receiver gets realtime INSERT events:
   - If not, we’ll inspect message SELECT RLS conditions again, but the biggest blocker right now is the failing insert trigger.

D) Repair challenges + VYBE Pass XP end-to-end (backend migration + frontend)
1) Fix challenge_progress RLS policies (critical):
   - Replace `auth.uid() = user_id` with `current_profile_id() = user_id` for SELECT and ALL.
   - This makes the UI able to read and write its own progress rows.
2) Fix `sync_my_challenge_progress()`:
   - Get the user’s profile id with `SELECT id FROM profiles WHERE user_id = auth.uid()`.
   - Never insert into `challenge_rewards` with a profile id:
     - Either rely entirely on the existing `on_challenge_completed` trigger (preferred), or insert using `auth.uid()` if still needed.
3) Fix `force_sync_my_challenges()` to call the corrected sync function.
4) Fix frontend `useVybePass` to use auth user id for auth-owned tables:
   - `user_levels.user_id` filters/inserts must use `profile.user_id` (auth id), not `profile.id`.
   - `challenge_rewards.user_id` queries/subscriptions must use `profile.user_id`.
   - Keep challenge_progress using `profile.id` (profile id), because that table is profile-owned.
5) Add a small “ID sanity helper” (frontend):
   - A single function that returns `{ profileId, authUserId }` and asserts both exist, used across pass/challenges.

E) Fix calls (edge function hardening + UI)
1) Harden `create-call-room` backend function:
   - If profile lookup `.eq('user_id', user.id)` fails, call a backend RPC to ensure a profile exists (e.g. `ensure_profile()` / `claim_profile_by_email()` flow) and retry once.
   - This prevents “Profile not found” from blocking calls for users whose profile link isn’t ready yet.
2) Validate calls table RLS remains compatible (it uses `current_profile_id()` which should work once profiles are linked correctly).

F) Clean up the profile-link trigger so it doesn’t break account claiming (backend migration)
1) Update `link_profile_to_auth()` trigger logic:
   - Do NOT set `user_id = id` for unclaimed/imported profiles.
   - Instead: `NEW.user_id := COALESCE(NEW.user_id, auth.uid());`
   - If `auth.uid()` is NULL (admin import), leave `user_id` NULL so `claim_profile_by_email()` can claim later.
2) This reduces “ghost profile” issues that break DMs between pre-created profiles and real signups.

Testing checklist (end-to-end, two accounts)
1) Create/open a DM, send text → should insert instantly and appear on other account without refresh.
2) Send:
   - image
   - voice
   - video
   - VYBE image
   - VYBE video
   Verify upload succeeds (no storage permission errors) and receiver can open it.
3) Unsend a message → should disappear for both users (realtime UPDATE).
4) Start a call → receiver should see ringing UI; accept/decline should update status.
5) Challenges:
   - Open Challenges → progress loads (not empty due to RLS).
   - Do an action (send message/post/comment) → progress updates live (realtime).
6) VYBE Pass:
   - Post something → XP increments and level row exists without FK errors.

Files / areas that will be modified once you approve implementation
Backend (migrations):
- Patch `notify_message_recipients()` and its trigger behavior
- Fix challenge_progress RLS policies
- Fix sync_my_challenge_progress() + force_sync_my_challenges()
- Fix link_profile_to_auth() trigger function

Frontend:
- `src/components/chat/ChatView.tsx` (upload paths + guards)
- `src/hooks/useInstantSend.ts` (video upload path)
- `src/hooks/useVybePass.ts` (use `profile.user_id` for user_levels + challenge_rewards)
- `supabase/functions/create-call-room/index.ts` (profile ensure/retry)

Rollout order (to stabilize fastest)
1) Backend hotfix for message trigger (unblocks all sends)
2) Frontend media/VYBE upload path fix
3) Challenge/VYBE Pass ID + RLS fixes
4) Calls hardening

Notes on scope
- This plan focuses on “nothing works” blockers first (message inserts + storage RLS + broken RLS on challenge_progress + auth/profile ID mismatches).
- After core DM reliability is restored, we can iterate on DM polish (typing indicators, vanish modes, read receipts edge cases) without risking system-wide failure.
