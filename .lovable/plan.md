## Why DM pushes aren't firing today

Three independent failures combine:

1. **Server-side trigger is silently broken.** A trigger `on_message_insert_notify` on `messages` calls a helper that reads `current_setting('app.settings.supabase_url')` and `current_setting('app.settings.service_role_key')`. Neither GUC is set on this Postgres instance (verified: both return empty). So for every DM, the trigger fires but `net.http_post` is called with `url := '/functions/v1/send-push-notification'` and a `Bearer ` header with no key — the request never reaches the edge function. Result: **no DM push has ever been delivered via the server trigger.**

2. **Client-side push only fires while the sender's tab is alive.** `useSendMessage.onSuccess` in `src/hooks/useMessages.ts` calls `sendMessagePush(...)`. If the sender closes the app right after sending, or the network blip drops the follow-up call, the recipient gets nothing. It also can't fire for messages inserted by other paths (offline outbox, edge functions, group fan-outs).

3. **Web users have no OneSignal identity binding.** `index.html` initializes the OneSignal Web SDK on `vybehub.app`, but nothing ever calls `OneSignal.login(profileId)`. The edge function targets users via `include_aliases.external_id = [profileId]`, so OneSignal returns "no recipients" for every web user. Only Despia (native APK) users currently have `external_id` bound (via `DespiaOneSignalSync`).

## What we'll change

### 1. Make the server-side push trigger actually work

- Store the Supabase service-role key in `vault.secrets` under a stable name (e.g. `push_service_role_key`) via the migration.
- Rewrite `public.notify_message_recipients()` and `public.fire_push_notification()` to:
  - Read the service-role key from `vault.decrypted_secrets`.
  - Use the hardcoded project URL `https://agtcyxjxgkdyoxwxkjth.supabase.co` (it's public — same value already shipped in `.env`).
  - Build the push body with **title = sender display_name (fallback username)** and **body = message text** (or `📷 Photo` / `🎤 Voice` / `🎬 Video` for media).
  - Keep `SECURITY DEFINER` + `SET search_path = public` and the existing `EXCEPTION WHEN OTHERS THEN NULL` so a push failure never blocks the INSERT.
- Re-attach the `on_message_insert_notify` AFTER INSERT trigger (it already exists; just confirm it points at the new function body).

### 2. Bind every web user to OneSignal so pushes reach them

- In `src/components/notifications/DespiaOneSignalSync.tsx` (or a new sibling `OneSignalWebSync.tsx` mounted alongside it), additionally call `window.OneSignalDeferred.push(OneSignal => OneSignal.login(profileId))` whenever the auth profile changes — on web, not just inside the Despia shell. Wrap in a try/catch so it's a no-op when the SDK didn't load (preview hosts, native wrappers, blocked CDN).
- Call `OneSignal.logout()` on sign-out so devices don't keep receiving pushes for the wrong account.

### 3. Remove the now-redundant client-side push

- Delete the `sendMessagePush` fan-out block from `useSendMessage.onSuccess` in `src/hooks/useMessages.ts` (lines ~405–449). The server trigger now handles 100% of DM pushes, so this block only causes double notifications. Keep the `sendMessagePush` helper in `src/lib/pushNotifications.ts` since calls and other flows still use it.

### 4. Verify

- After migration: send a DM from account A to account B with B's app fully closed; B receives a push titled with A's name and bodied with the message text.
- Inspect `select * from net._http_response order by created desc limit 5;` to confirm a 200 response from `send-push-notification` after each DM insert.
- Check edge function logs for `OneSignal non-OK` warnings; if recipient is web-only and `OneSignal.login` ran, OneSignal should accept and deliver.

## Files touched

- New migration: `supabase/migrations/<timestamp>_dm_push_trigger_vault.sql` — vault secret + rewritten `fire_push_notification` and `notify_message_recipients`.
- `src/components/notifications/DespiaOneSignalSync.tsx` — also bind `OneSignal.login(profileId)` on web; `OneSignal.logout()` on sign-out.
- `src/hooks/useMessages.ts` — remove duplicate client-side push fan-out in `useSendMessage.onSuccess`.

No UI changes. No design changes.