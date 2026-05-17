## Three independent fixes

### 1. Auto-reconnect without closing/reopening the app

Today the reconnect manager (`src/lib/reconnectManager.ts`) early-returns false whenever `navigator.onLine === false`. On mobile WebViews (Despia) and PWAs that flag is unreliable — it can stick at "offline" long after the network is back, so the only fix is killing the app.

Changes in `src/lib/reconnectManager.ts`:
- Drop the early `navigator.onLine === false` short-circuits inside `probeReachable` and `handleOnline` — always run the HEAD probe and trust its result. The probe itself is the source of truth.
- Start the polling loop on boot (not just after an `offline` event) and keep it running at all times: fast poll (3s, growing to 15s) while offline, slow heartbeat (60s) while online so we instantly detect signal loss without waiting for OS events.
- On every probe success, if `lastKnownOnline` was false, fire `vybe:online` and invalidate active stale queries (already wired) so DMs, feeds, notifications all repaint without any manual refresh.
- Also re-fire reconnect on `pageshow` (covers iOS/Capacitor cold-resume from background where neither `online` nor `visibilitychange` always fires).
- Use a probe URL that survives Capacitor (`./favicon.ico` relative + cache-bust) so it works under `capacitor://localhost` and PWA shells.

Net effect: app is "always trying"; the moment any connection (Wi-Fi → cellular handoff, captive portal release, background→foreground) is reachable, queries refetch automatically — no reopen needed.

### 2. Single delete button for mods/owners + instant disappear

In `src/components/posts/PostCard.tsx`, mods currently see **two** delete entries on someone else's post:
- "Delete Post" (from the `canDelete` branch because `isAdmin` is true) — uses `window.confirm` and only invalidates queries.
- "Delete Post (Mod)" (from `ModeratorMenuItems`) — instant, no confirm, but the card itself doesn't disappear because PostCard never passes `onPostDelete`.

Changes:
- `src/components/posts/PostCard.tsx`
  - Change `canDelete` gate so the personal "Delete Post" only appears when `isOwnPost` is true. Mods/owners use the Mod Actions entry instead. (On a mod's own post they still see Edit/Pin/Delete as the author.)
  - Add local `isHidden` state. Pass `onPostDelete={() => setIsHidden(true)}` into `<ModeratorMenuItems …>` and into `<ModeratorDialogs …>`. When `isHidden` is true, return `null` from the component so the card vanishes the instant the mod taps Delete — no list refresh required.
  - Also call the same setter inside the author's own `handleDelete` after a successful delete so own-deletes disappear instantly too.
- Same two changes in `src/components/posts/ShortCard.tsx` (it has the identical dual-delete bug). Apply the `isOwnPost`-only gate on its `canDelete` mod-delete dropdown item and wire its own `isHidden` state.

### 3. Reports + bug reports actually reaching the admin panel

Bug reports: RLS already uses `has_role(auth.uid(), …)` and `useAutoBugReporter`/`bugReportClient` insert with `reporter_id = auth user id`, so they should land. Confirm by spot-checking `select count(*) from bug_reports` in the migration step; if rows exist and `useAdminBugReports` still shows nothing, the cause is the SELECT policy mismatch fixed below.

User reports: the bug is in the database. The `reports` table SELECT/UPDATE policies are:

```
has_role(current_profile_id(), 'admin') OR has_role(current_profile_id(), 'moderator')
```

`current_profile_id()` returns `profiles.id`, but `has_role` looks up `user_roles_auth.user_id` which stores `auth.uid()`. The check therefore never matches, so the admin panel (`useReports`) returns zero rows even though `reports` rows are being inserted correctly. `bug_reports` policies already use `auth.uid()` and work.

Migration (single SQL):
- Drop and recreate "Admins can view all reports" and "Admins can update reports" on `public.reports` using `has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator')`.
- Leave INSERT policy ("Users can create reports") untouched.
- No app code change needed; once the policy is fixed, existing reports immediately appear in `AdminReportsSection` and new reports stream in normally.

### Out of scope (untouched)
- OneSignal / Despia push pipeline (already verified routing through `send-push-notification`).
- DM React Query configs (already reverted last turn).
- Outbox, realtime subscriptions, and any UI styling.
