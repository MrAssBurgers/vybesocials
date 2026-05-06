
## Goal
Address five separate bugs reported on the Play Store build:
1. Lingering text flicker (gradient/clip-text)
2. Some Android phones force landscape; in portrait, profile avatar tap and call/FaceTime buttons in DMs don't work
3. App is laggy on weak/slow networks
4. Push notifications for new DMs and calls never arrive on the receiver's phone
5. Repeated "something went wrong, please refresh" errors

## Root causes I found

**Flicker** — `index.html` uses the font-loading guard correctly (`data-theme-loading`), but `flickerGuardCheck.ts` is dev-only. A few hot spots (hashtags, post composer "Vybe Check" pill, daily-brief headlines, nudge text) still mount with `bg-clip-text text-transparent` *without* a fallback `color` before fonts settle. We need to add `text-foreground`/`color: inherit` fallbacks on those specific elements and re-run the guard scanner.

**DM header on small Android phones** — `src/components/chat/ChatView.tsx` header (lines 1274-1383) renders: back arrow, avatar button, flex-1 name block, then `<CallButtons>` and a `<DropdownMenu>` trigger. On narrow screens (≤360px) the name block doesn't shrink enough, pushing the call buttons off-screen and overlapping the avatar button. Tapping the avatar hits the overflowing call icons instead. Fix: tighten header (`min-w-0` on flex-1 already there, but call-button cluster has no `flex-shrink-0`/`ml-auto`), reduce icon sizes on `<sm`, and wrap call buttons in a container with `flex-shrink-0`.

**Call/FaceTime buttons not firing** — `CallButtons` uses `callStore.startCall` which calls `supabase.functions.invoke('send-push-notification', …)` (line 679 of `callStore.tsx`). On Despia/Android with weak network this throws and the call never starts because the invocation isn't wrapped in a fire-and-forget. We'll detach the push send from the call-init promise so the call always starts locally first.

**Push notifications not delivered** — `supabase/functions/send-push-notification/index.ts` requires VAPID keys for web push and falls through to OneSignal only if `ONESIGNAL_APP_ID`/`ONESIGNAL_REST_API_KEY` are set as edge-function secrets. We need to: (a) verify those secrets are present (use `secrets--fetch_secrets`), and (b) make sure `DespiaOneSignalSync` actually fires `setonesignalplayerid://` on cold start *and* on every auth change so the receiver is registered as the external user id. Currently it only sets the player id once but never requests permission on first launch, so brand-new installs have no subscription. Add an explicit one-time `checkNativePushPermissions://` call after first user gesture (e.g. when they open the first DM) gated by a localStorage flag.

**"Something went wrong, please refresh"** — comes from `useAutoBugReporter` + global error boundary triggered by failed Supabase queries when offline. The query guard in `src/lib/queryGuard.ts` already gates by `authReady`, but `useNotifications`, `useUnreadCount`, etc. retry aggressively. We'll: (a) add `retry: (n, err) => n < 2 && !isNetworkError(err)` and `networkMode: 'offlineFirst'` defaults, (b) suppress the toast/error-boundary trigger for known network errors, and (c) ensure the error boundary's "refresh" CTA actually re-mounts the subtree instead of full reload.

**Lag on weak internet** — combine: enable `networkMode: 'offlineFirst'` on the React Query default options (in `src/main.tsx` or query client setup), add `staleTime` defaults of 60s, enable optimistic updates that already exist for DMs, and short-circuit signed-URL refetches with the existing `signedUrlCache`. Also raise the React Query default `gcTime` to 30 min so revisits don't re-fetch.

## Plan of changes

1. **Flicker fallback**
   - `src/components/posts/PostCard.tsx` (hashtag pills): add `style={{ color: 'currentColor' }}` fallback on the `bg-clip-text` span.
   - `src/components/create/MobilePostComposer.tsx`: same fix for the new "Vybe Check scanning…" pill.
   - `src/components/home/DailyBriefWidget.tsx` & `AIBriefSheet.tsx`: add `text-foreground` next to any `bg-clip-text text-transparent` headline.
   - `src/components/home/PostNudgeWidget.tsx`: confirm fallback is set on its title.

2. **DM header layout (Android sizing fix)**
   - `src/components/chat/ChatView.tsx` (lines 1274-1383): wrap avatar button + name in a single `flex-1 min-w-0` container, and put `<CallButtons>` + 3-dot menu in a sibling `flex-shrink-0 ml-auto flex items-center` group. Reduce call-button icon size to `h-8 w-8` on `<sm` (already responsive but tighten).
   - `src/components/chat/CallButtons.tsx`: confirm root has `flex items-center gap-1 flex-shrink-0`.

3. **Call buttons reliability**
   - `src/lib/callStore.tsx` (~line 679): wrap the `send-push-notification` invoke in `void supabase.functions.invoke(...).catch(...)` so call init never blocks/throws on push failure.
   - Add a 5s timeout race so weak network doesn't hang the call sheet.

4. **Push notification delivery**
   - Verify `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` exist via `secrets--fetch_secrets`. If any are missing, prompt user via `add_secret`.
   - `src/components/notifications/DespiaOneSignalSync.tsx`: on first DM/call interaction (gesture), call `despia('checknativepushpermissions://')` once (guarded by `localStorage.vybe_push_permission_asked`). Keeps boot quiet (per existing comment) but ensures permission is actually requested.
   - `supabase/functions/send-push-notification/index.ts`: add `mutable_content`, ensure `android_channel_id: 'messages'` for non-call types so the OS shows banners with sound when app is backgrounded. Add brief logging when `tokens.length === 0` *and* OneSignal returned non-OK so we can audit later.

5. **Network resilience / lag**
   - `src/main.tsx` (or wherever `QueryClient` is created): add defaults `{ queries: { networkMode: 'offlineFirst', staleTime: 60_000, gcTime: 30 * 60_000, retry: 2, retryDelay: attempt => Math.min(1000 * 2**attempt, 8000), refetchOnWindowFocus: false } }`.
   - `src/hooks/useAutoBugReporter.ts`: ignore `TypeError: Failed to fetch`, `AbortError`, and Supabase `PGRST` network errors (no toast, no DB report).
   - Global ErrorBoundary "Refresh" CTA: change from `window.location.reload()` to resetting the boundary so users don't lose state on transient errors.

6. **Verify**
   - After edits, view PostCard tag area, ChatView header on `375x812` and `360x800` viewports via `browser--set_viewport_size`, and confirm flicker scanner reports zero offenders.

## Notes for the user
- I will need to confirm OneSignal + VAPID keys are set in Lovable Cloud secrets; if not, you'll see a prompt to paste them. Without those, the actual phone push delivery cannot work — code changes alone won't fix it.
- After this patch lands, you'll need to run `npx cap sync` and rebuild your APK/Play Store bundle for the native fixes to ship to users.
