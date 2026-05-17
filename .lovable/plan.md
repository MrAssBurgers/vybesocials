## Goals
1. Discord-style "Listening to Spotify" UI — auto-detect when the signed-in user plays Spotify and show their own Now Playing widget globally.
2. Make incoming login-approval prompts:
   - Pop **instantly** (realtime, no refresh).
   - Trigger a **push notification** so the trusted device wakes up if backgrounded.
   - Appear **centered** on screen (modal), not a bottom sheet.
3. When the trusted device taps Approve/Deny, the signed-out device logs in (or aborts) **instantly** with no refresh.

## Root causes

### Spotify Now Playing not visible
- `useSpotifyPresence` already polls `spotify-now-playing` every 15s and upserts `live_music_presence`.
- `useLiveMusicPresence` already subscribes to that table.
- But the only places it renders are: **friends in `DesktopRightSidebar`**, **`ConversationList`**, **`ChatView`**, and the **profile page of another user**. The signed-in user never sees their own playback anywhere.
- Result: even when polling works, the user has no UI to see it.

### Login approval doesn't pop instantly + needs refresh
- `LoginApprovalSheet` already subscribes to `auth_challenges` realtime + 15s polling and is mounted in `App.tsx`, so realtime should fire. The reasons it still feels broken:
  - It renders as a **bottom Sheet** (`side="bottom"`), not a center modal — user perceives "it shows up at the top after refresh" because they're looking center.
  - **No push notification** is dispatched when a new `login_approval` challenge is created in `auth-login-approval` (`action: 'request'`). When the trusted device is backgrounded / app closed, nothing wakes it up; opening the app cold then triggers `refresh()` and the sheet appears, which feels like "I had to refresh".
  - Race on identity: the realtime subscription uses `user.id` (auth uid). The challenge insert also uses auth uid, so this is correct, but if `authReady` flips false→true after the INSERT fires, the listener missed the event. The polling falls back at 15s, so the user thinks "I had to refresh".

### Approve click doesn't log in the waiting device instantly
- `auth-login-approval` already broadcasts a `login-approval:{challengeId}` channel after `respond`. `LoginGateModal` already subscribes to it and calls `poll()` once on `resolved`.
- Issue: the **broadcast channel sometimes fires before the row update is visible** to the next `poll()` call (read-your-write race against the admin update). When `poll()` runs immediately on broadcast, it can still see `status: 'pending'` and schedule a 3s retry — that's the "I had to refresh" delay.

## Changes

### A. Discord-style self Now Playing
- Create a new `SelfNowPlayingPill` component that uses `useLiveMusicPresence(user?.id)` for the signed-in user and renders a compact Spotify pill (album art thumbnail, "Listening to Spotify", track · artist, equalizer bars). Reuse the green `#1DB954` styling already present in the sidebar.
- Mount the pill in two places:
  - **Mobile**: floating just above the bottom nav on `/home` and `/profile` (small, dismissible, only visible when `is_playing && title`).
  - **Desktop**: top of `DesktopRightSidebar`, above the friends row, when the signed-in user is currently playing.
- Speed up detection: in `useSpotifyPresence` poll every **8s** while the tab is visible (still 15s when hidden), and fire one immediate tick when the user navigates to `/home` or `/profile` (visibility/route trigger already wired — just shorten interval).

### B. Login approval — instant + push + centered

#### B1. Send a push notification on challenge creation
- In `supabase/functions/auth-login-approval/index.ts` `action: 'request'`, after the challenge insert, fire-and-forget call to `send-push-notification`:
  - `title: "Approve sign-in?"`
  - `body: "{device} · {city, country}"`
  - `url: "/?login-approval={challengeId}"`
  - `tag: "vybe-login-approval-{challengeId}"`
  - `type: "general"`
- No new secrets — `send-push-notification` already accepts arbitrary `type` and resolves the user's push tokens.

#### B2. Convert approval prompt to a centered modal
- Rewrite `LoginApprovalSheet.tsx` to render with `Dialog` (the centered shadcn dialog already used by `LoginGateModal`) instead of `Sheet side="bottom"`. Keep the same content: device, location, Approve / It wasn't me.
- Add a soft "wake" toast + haptic when a new approval lands (already done) and play a short ping sound on arrival.

#### B3. Make realtime more robust
- In `LoginApprovalSheet`, also listen for `UPDATE` events (covers status flips from other devices that already approved).
- Re-run `refresh()` on `visibilitychange → visible` and on `authReady` flipping true — currently it only runs once at mount.

### C. Instant cross-device login on approve

#### C1. Eliminate the read-your-write race in `auth-login-approval`
- In `action: 'respond'`, after the UPDATE succeeds, include the **session tokens** directly in the broadcast payload (only when intent is `approve`) so the waiting client doesn't need a follow-up poll.
- The session was stored in `metadata.session` during preauth. Read it, scrub it from metadata (same single-use semantics as the poll path), and emit:
  - `payload: { status: 'approved', challengeId, session }`

#### C2. Consume broadcast session directly in `LoginGateModal`
- In the broadcast handler, if `payload.session` is present, call `finalize('approved', payload.session)` directly — no extra `poll()` round-trip. Fall back to `poll()` only if the payload omits a session (older edge function version).

#### C3. Speed up the polling safety net
- Reduce the polling fallback in `LoginGateModal` from 3000ms to 1500ms while waiting for approval. This is purely a safety net since broadcast should now carry the session.

## Out of scope
- No DM changes, no camera changes, no schema migrations (all tables already in `supabase_realtime`).
- No new secrets, no provider changes.

## Files touched
- `src/components/music/SelfNowPlayingPill.tsx` (new)
- `src/components/layout/AppLayout.tsx` *or* `src/pages/Home.tsx` + `src/pages/Profile.tsx` (mount pill — exact host TBD after a quick layout read)
- `src/components/layout/DesktopRightSidebar.tsx` (add self pill above friends)
- `src/hooks/useSpotifyPresence.ts` (8s interval while visible)
- `src/components/auth/LoginApprovalSheet.tsx` (Dialog instead of Sheet, listen for UPDATE, refresh on visibility/authReady, ping sound)
- `src/components/auth/LoginGateModal.tsx` (consume session from broadcast payload, 1.5s poll fallback)
- `supabase/functions/auth-login-approval/index.ts` (push on request, include session in respond broadcast)
