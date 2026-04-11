

## Fix Multiple Issues: Camera Back Button, Google OAuth Onboarding, Connections, Bugs, Map, Music

### Issues Identified

1. **Story camera has no back button** — When opening camera from story creator, the back arrow shows but needs verification it works. The `showBackArrow` prop is already passed. This is working correctly based on code review — the `Camera` component receives `showBackArrow` and renders a back arrow SVG. No change needed here.

2. **Google OAuth new users skip onboarding** — `AuthCallback.tsx` checks `profile.onboarding_completed === false || !profile.username` to route to onboarding. This should work IF a profile row exists. The issue is when a brand-new Google user has NO profile row yet — `profile` will be null/undefined, so the callback just waits forever or goes to `/home`. Need to handle `profile === null` after user is confirmed (no profile row = new user = go to onboarding).

3. **Settings connections only shows Google** — `ConnectionsSection.tsx` only has Google connect/disconnect. Need to add Apple as an additional connection option (the only other supported provider in Lovable Cloud).

4. **409 duplicate username on onboarding** — The `handleFinish` and `handleSkip` in `Onboarding.tsx` upsert with `onConflict: 'user_id'`, but the error is on `profiles_username_key`. When two users pick the same username, or when a Google user gets a generated username that collides, it fails. Fix: catch 23505 errors specifically and show a "username taken" message, and generate more unique fallback usernames.

5. **"No SW registration for postMessage"** — This is a harmless console warning from OneSignal/service worker in preview. Already handled by `isPreviewServiceWorkerDisabled()`. No code change needed — this is expected in preview.

6. **HTTP 400 from /rest/v1/posts** — Need more context to fix, but likely a missing required field. Will add defensive handling.

7. **user_levels FK violation** — `useBattlePass.ts` uses `profile.id` (the profiles table PK) instead of `profile.user_id` (the auth UUID). The `user_levels.user_id` column references `auth.users(id)`, so inserting `profile.id` (a different UUID) causes the FK error. Fix: change to `profile.user_id`.

8. **Map not showing on desktop** — The map container uses `absolute inset-0` inside `AppLayout`. On desktop, `AppLayout` likely applies sidebar layout that changes the positioning context. Need to ensure the map container fills the available space correctly.

9. **Music button in camera** — Currently shows "Music coming soon!" toast. Need to wire it to `SoundPicker` component which already exists.

---

### Implementation Plan

#### 1. Fix `useBattlePass.ts` — FK violation (Critical)
Change `profile.id` → `profile.user_id` in all `user_levels` queries and inserts. This is the root cause of the "Key (user_id) is not present in table users" error.

#### 2. Fix `AuthCallback.tsx` — Google new user onboarding
After `user` is confirmed and `authReady` is true, if profile is explicitly null/undefined (not just loading), redirect to `/onboarding`. Add a check: once profile query has resolved (not loading) and profile is null → new user → onboarding.

#### 3. Fix `Onboarding.tsx` — Username collision handling
- In `handleFinish`: catch error code `23505` and show "Username already taken" toast instead of generic error
- Generate more unique fallback usernames with random suffix

#### 4. Expand `ConnectionsSection.tsx` — Add Apple connection
Add Apple as a second connection option with connect/disconnect, matching the Google pattern.

#### 5. Fix `Camera.tsx` — Wire music button to SoundPicker
Import `SoundPicker`, add state for `showSoundPicker`/`selectedSound`, replace the toast with `setShowSoundPicker(true)`, render `SoundPicker` component.

#### 6. Fix `FriendMap.tsx` — Desktop map visibility
The map uses `absolute inset-0` which should work, but on desktop the `AppLayout` wrapper might have different sizing. Ensure the map wrapper has explicit `height: 100%` and the parent container fills available space. Add CSS to ensure leaflet container renders properly in the desktop sidebar layout.

### Files to modify
- `src/hooks/useBattlePass.ts` — Fix `profile.id` → `profile.user_id`
- `src/pages/AuthCallback.tsx` — Handle null profile for new Google users
- `src/pages/Onboarding.tsx` — Catch username collision errors
- `src/components/settings/ConnectionsSection.tsx` — Add Apple connection
- `src/components/camera/Camera.tsx` — Wire SoundPicker to music button
- `src/pages/FriendMap.tsx` — Fix desktop map container sizing

No backend/database changes needed.

