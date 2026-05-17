## 1. Notifications settings page loads forever

**Cause:** `NotificationsSection` blocks the entire page on `useNotificationPreferences().isLoading`, and that query waits for `useAuth().profile` to resolve. On slow auth boots the skeleton sits there.

**Fix:**
- Remove the full-page skeleton gate. Render the cards immediately with the defaults (`useNotificationPreferences` already returns defaults when no row exists), and let individual toggles update once data arrives.
- Pass `staleTime: 5 * 60_000` and `placeholderData: <defaults>` to the query so it stops re-fetching on every mount.
- Skip the `pushSupported` check / SW registration until the user actually interacts — defer `registerServiceWorker()` to the first `subscribe()` call instead of in the mount `useEffect`. This shaves the "checking subscription" delay.

## 2. "Feature me on landing" toggle doesn't show your pic

**Cause:** `get_landing_top_creators` only returns users who posted in the last 24h **and** have an engagement score > 0. So flipping the toggle on a quiet account shows nothing.

**Fix migration:** rewrite `get_landing_top_creators(_limit)` so opted-in profiles always surface, ordered by 24h score when present, then by total followers/recent activity, then by `created_at` — and remove the `s.score > 0` filter. Keeps `is_private = false AND feature_on_landing = true` as the only hard gates.

## 3. Daily brief (morning / midday / afternoon) never arrives on the public build

**Cause:** `send-brief-notification` exists but there is **no `cron.schedule` row** that actually calls it. The prewarm cron exists, but nothing fires the brief push itself.

**Fix migration:** add three `cron.schedule` entries (`brief-push-morning` 13:00 UTC ≈ 6am PT-ish, `brief-push-lunch` 19:00 UTC, `brief-push-dinner` 01:00 UTC) that `net.http_post` to `…/functions/v1/send-brief-notification` with the service-role bearer. Use the same pattern as the existing prewarm cron in `20260517040426_*.sql`.

## 4. Phone push notifications don't arrive at all (DMs / friend requests / etc.)

**Cause:** OneSignal's `external_id` is bound to **auth user id** by `DespiaOneSignalSync` (`data.user?.id`), but most app call sites (`sendMessagePush`, `sendFriendRequestPush`, comment/like notifications, brief push for the in-app row, etc.) pass **profile.id** as the target. OneSignal then has nobody to deliver to.

**Fix:** standardize on `profile.id` everywhere.
- `DespiaOneSignalSync`: after auth resolves, look up `profiles.id` for the auth user and call `setonesignalplayerid://?user_id=${profile.id}` (instead of auth uid). Re-run on `onAuthStateChange`.
- `usePushNotifications.subscribeDespia`: already uses `profile.id` — leave as-is.
- `send-brief-notification`: it currently passes `authUserId` to `send-push-notification`. Change the call to pass `profile.id` (it already looks up the profile a few lines above for the in-app row).
- Leave `send-push-notification` untouched; it forwards whatever id it's given to OneSignal `external_id`, which will now consistently match.

## Technical details

**Files**
- `src/components/settings/NotificationsSection.tsx` — drop the loading skeleton early-return; render with defaults.
- `src/hooks/useNotificationPreferences.ts` — add `staleTime` + `placeholderData`.
- `src/hooks/usePushNotifications.ts` — lazy-register SW on first `subscribe()`; keep `checkSubscription` but don't gate UI.
- `src/components/notifications/DespiaOneSignalSync.tsx` — resolve profile id and use it for `setonesignalplayerid://`.
- `supabase/functions/send-brief-notification/index.ts` — send push with `profile.id`, not `authUserId`.

**Migrations**
1. Replace `public.get_landing_top_creators(_limit int)`:
   - Left-join opted-in profiles to 24h-scored posts.
   - Filter: `is_private = false AND feature_on_landing = true`.
   - Order: `score DESC NULLS LAST, created_at DESC`.
2. Three new `cron.schedule(...)` rows invoking `send-brief-notification` via `net.http_post` (morning/lunch/dinner UTC).

No new secrets needed — `ONESIGNAL_APP_ID` and `ONESIGNAL_REST_API_KEY` are already set.