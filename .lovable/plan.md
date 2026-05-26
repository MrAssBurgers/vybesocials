## Plan: Stability & ownership pass

### 1. "Cannot update saved state" on DM tap
The `toggle_message_saved` RPC exists but errors on group messages (sender/recipient columns are NULL for group chats). Fix:
- In `ChatView.tsx` tap-to-save handler, short-circuit for group conversations and only allow saving in 1:1 DMs (Snapchat-style is a 1:1 concept anyway).
- In `useToggleSavedMessage` (`src/hooks/useMessages.ts`), inspect the error code: if the RPC returns "no row updated", treat as silent no-op instead of a destructive toast. Show toast only for true network/auth failures.
- Make the mutation optimistic: flip badge instantly, roll back on error.

### 2. "Failed to generate theme"
Edge function `generate-theme` is hitting Gemini 503 rate limits (confirmed in logs from `ai-catch-up`). Fix:
- Add retry-with-backoff (3 attempts, 1.5s/3s/6s) in `supabase/functions/generate-theme/index.ts`.
- On final failure, fall back to `google/gemini-2.5-flash-lite` (cheap, almost always available).
- Surface a clean toast: "AI is busy — try again in a few seconds" instead of a generic error.

### 3. Posts & profile images load slowly
Today posts use plain `<img>` with lazy default. Fix:
- In `PostCard` / `ProfilePostGrid` / `ClipCard`, mark above-the-fold images `loading="eager"` + `fetchpriority="high"` for the first 6 visible items, lazy for the rest.
- Add `decoding="async"` everywhere and width/height attrs to lock layout (cuts CLS + decode time).
- Warm signed URLs in batch on feed fetch (already have batch-sign in `src/lib/signedUrls.ts` — wire it into `usePosts` so URLs are pre-signed before render instead of on-mount).
- Add `<link rel="preconnect">` for the Supabase storage origin in `index.html`.

### 4. Auto-Pilot mode can't switch between off/suggest/autonomous
RLS on `dna_agent_settings` is correct, but `setMode` in `useDNAAutoPilot.ts` is fire-and-forget — no error surfacing, no await on UI, and the optimistic state can revert if the upsert silently fails. Fix:
- Make `updateSettings` properly await and check `error`; on error, roll back optimistic state and toast.
- Pre-create the row on first load if missing (so the upsert key conflict path is guaranteed).
- Add 3s timeout so a stuck network doesn't lock the toggle.
Also speed it up: switch from `setState({...})` then `await upsert` to fire optimistic UI first and run the upsert in background with abort signal.

### 5. Daily Brief AI not pulling
`ai-catch-up` logs show repeated 503 from `google/gemini-2.5-pro`. Fix:
- Switch primary model to `google/gemini-3-flash-preview` (faster, less-throttled per memory).
- Add backoff retry (same pattern as theme).
- Cache last successful brief in the DB so when AI is down we still show *something*.

### 6. @Bakrix (barron.bakic@gmail.com) permanent owner
Confirmed: profile `e78010f2-d5f1-428b-b5df-8fc6b768772d` (username `mrassburgers`) currently has `admin` + `moderator` but no `owner` role. Plan:
- Migration: insert `('e78010f2-…','owner')` into `user_roles` (idempotent via `ON CONFLICT DO NOTHING`).
- Add a hard-coded auth-ID safety net in `useIsOwner.ts` / `isCurrentUserOwner`: if `auth.uid() === '703760a8-1245-4fc1-b242-32619ecc0ef3'`, return `isOwner: true` even if the DB lookup hasn't resolved yet. This guarantees Bakrix never loses access on Live, even if a role row is accidentally removed.
- Note: migration applies to Test on save and Live on publish — covered.

### 7. Remove online/offline popup completely
Per your choice — silent background reconnect.
- Remove `ConnectionStatusBanner` from `AppLayout` (keep file in case we want it later, but unmount).
- Remove the "Back online" sonner toast in `src/components/error/GlobalErrorHandler.tsx`.
- Keep `reconnectManager` running (refetches queries, flushes outbox) — just no UI.

### 8. OneSignal: "never get any push on my phone"
This is a subscription-side issue, not send-side. Plan:
- Add a diagnostic surface in Settings → Notifications showing: OneSignal subscription ID, permission state, last-error, and a "Send me a test push" button that calls a new edge function `onesignal-test-push` using your own player ID.
- Audit `useOneSignal` init flow: ensure `OneSignal.User.PushSubscription.optIn()` is called after permission grant (a missed `optIn()` is the most common cause of "subscribed but no pushes").
- Verify the OneSignal SDK is initialized on the live domain (`vybehub.app`) and not just preview — `safari_web_id` and `subdomain` need to match the live origin.
- Check that `external_id` is set to your auth ID so server sends can target you.
- For Despia wrapped app: confirm the iOS push capability and APNs cert are wired in OneSignal dashboard (I'll surface a clear checklist in the diagnostic panel; the cert itself you have to upload).

### Technical execution order
```text
1. Migration: grant owner role to Bakrix profile
2. Edge functions: generate-theme + ai-catch-up retry/backoff/fallback model
3. New edge function: onesignal-test-push (diagnostic)
4. Frontend:
   - useMessages tap-to-save: group guard + optimistic + silent no-op
   - useDNAAutoPilot: awaited upsert with rollback + row pre-create
   - useIsOwner: hard-coded auth-ID safety net for Bakrix
   - PostCard/ProfilePostGrid/ClipCard: eager loading + batch presigning
   - index.html: preconnect to storage origin
   - AppLayout: unmount ConnectionStatusBanner
   - GlobalErrorHandler: remove back-online toast
   - Settings → Notifications: OneSignal diagnostic panel
   - useOneSignal: ensure optIn() + external_id
```

### Files touched (approx 12)
- `supabase/migrations/<new>.sql`
- `supabase/functions/generate-theme/index.ts`
- `supabase/functions/ai-catch-up/index.ts`
- `supabase/functions/onesignal-test-push/index.ts` (new)
- `src/hooks/useMessages.ts`
- `src/hooks/useDNAAutoPilot.ts`
- `src/hooks/useIsOwner.ts`
- `src/components/chat/ChatView.tsx`
- `src/components/feed/PostCard.tsx` (+ ProfilePostGrid, ClipCard)
- `src/hooks/usePosts.ts`
- `index.html`
- `src/components/layout/AppLayout.tsx`
- `src/components/error/GlobalErrorHandler.tsx`
- `src/components/settings/NotificationSettings.tsx` (diagnostic panel)
- `src/hooks/useOneSignal.ts`

Approve and I'll execute.