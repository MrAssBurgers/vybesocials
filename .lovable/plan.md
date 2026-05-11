## 1. Real "Early Members" avatars on /vybe-home

Replace the static demo faces in the early-members chip on `src/pages/VybeHome.tsx` with the **top 4 public, opted-in profiles ranked by 24h engagement score**.

### Backend
- Add column `feature_on_landing boolean default false` to `profiles` (opt-in).
- Add a Settings → Privacy toggle "Feature me on the landing page" that writes this flag.
- Create SECURITY DEFINER RPC `get_landing_top_creators(limit int default 4)` that returns `{id, username, display_name, avatar_url, score}`:
  - Joins `posts` created in the last 24h with their reaction/comment/share/view counts.
  - Score = `views*0.1 + likes*1 + comments*3 + saves*4 + shares*5` (matches the existing Ranked Discovery Algorithm memory).
  - Filters: `profiles.is_private = false`, `feature_on_landing = true`, not banned.
  - Orders by score desc, ties broken by most-recent post.
  - `SET search_path = public`. Granted to `anon` + `authenticated` (landing page is public).
- Cache result for 1h via a `landing_top_creators_cache` table or `localStorage`-side TTL; we'll use server-side `to_char(now(),'YYYY-MM-DD-HH')` as a memo bucket so it naturally rolls daily/hourly.

### Frontend
- New hook `src/hooks/useLandingTopCreators.ts` — React Query, `staleTime: 1h`, `refetchInterval: 1h`.
- In `VybeHome.tsx`, replace the hard-coded `maya/jordan/leo/sky` array driving the early-members avatar stack with the hook's data. Map to existing square `<Avatar src=... />` component (pass `avatar_url` from Supabase storage; signed URL not required if avatars bucket is public, otherwise use `useSignedUrl`).
- If <4 results returned, fill the remaining slots with the existing on-brand demo avatars so the row never looks empty.
- Keep current visual treatment (overlap, ring, count label).

## 2. 48h disappearing DMs with tap-to-save

Default ON for **all 1:1 DMs** (group chats unaffected). Saved messages stay forever and visually flag on both sides.

### Backend
- Add columns to `messages`:
  - `expires_at timestamptz` — set to `created_at + interval '48 hours'` for new 1:1 DM messages (trigger `set_dm_expiry_on_insert`, only when `conversations.is_group = false`).
  - `saved_by_sender boolean default false`
  - `saved_by_recipient boolean default false`
  - `saved_at timestamptz`
- Computed `is_saved = saved_by_sender OR saved_by_recipient`. When either is true, a trigger nulls `expires_at`.
- Cleanup: scheduled `pg_cron` job every 5 min runs
  `UPDATE messages SET is_deleted = true, content = null, media_url = null WHERE expires_at < now() AND is_deleted = false;`
  (soft delete to preserve thread structure & match existing `is_deleted` UX path).
- RPC `toggle_message_saved(message_id uuid)`:
  - Resolves whether caller is sender or recipient on that message's conversation.
  - Toggles the corresponding column, sets/unsets `saved_at`, returns new state.
  - Realtime: existing `useRealtimeMessages` UPDATE handler already updates cache on `messages` UPDATEs, so both sides see it instantly.
- RLS: only conversation participants can call the RPC; cleanup runs as definer.

### Frontend
- Extend `Message` type to include `expires_at`, `saved_by_sender`, `saved_by_recipient`, `saved_at`.
- In `ChatView` / message bubble component:
  - Render a small "⏱ 48h" hint under unsaved DM bubbles when remaining < 12h (subtle muted text).
  - Tap-to-save: single tap on a DM bubble (1:1 only) toggles save via `toggle_message_saved`. Don't conflict with existing long-press hold menu — use a tap handler with movement threshold (`<5px` per the UI Cleanliness memory).
  - Saved bubbles get a tinted style: outgoing → `bg-primary/30` with `ring-1 ring-primary/60`; incoming → `bg-cyan-500/15 ring-1 ring-cyan-400/40`. Tiny "Saved" label with an `Bookmark` icon below the bubble, prefixed with who saved it ("Saved by you" / "Saved by @handle"). Mirrors Snapchat behavior — both users see it.
  - Add "Save / Unsave" entry to existing `DMHoldMenu` for accessibility.
  - Hide expired (soft-deleted) messages from the list as the existing `is_deleted` path already does.
- Optional toast on first save in a thread: "Kept — both of you can see it stays."

### Out of scope
- Group chat disappearing logic (left as future enhancement; the toggle is 1:1 only).
- Per-message custom timers or per-conversation toggles.
- Backfilling `expires_at` for historical messages (only new messages after migration get auto-expiry).

## Files touched
- `src/pages/VybeHome.tsx`
- `src/hooks/useLandingTopCreators.ts` (new)
- `src/components/chat/ChatView.tsx` (or the bubble subcomponent)
- `src/components/chat/DMHoldMenu.tsx` (Save row)
- Settings privacy panel (existing privacy settings page) — add toggle
- Supabase migration: profiles column, messages columns + triggers, RPC, pg_cron job
