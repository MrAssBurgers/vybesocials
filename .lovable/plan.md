## Problem
The current flow successfully writes the OneSignal external_id alias, but it does not guarantee the native device actually has an enabled push subscription. That is why the app can show “linked” while the target box still says “no active push subscription yet.”

## Patch plan
1. **Make native registration stronger**
   - Update `src/lib/despiaOneSignal.ts` to run the native registration command first when permission is requested, then set the external_id alias after registration.
   - Try the known Despia registration/link bridge variants with short bounded retries instead of relying on a single queued bridge call.
   - Keep the UI responsive by doing follow-up re-link attempts in the background.

2. **Verify subscriptions correctly**
   - Update `supabase/functions/onesignal-user-lookup/index.ts` to return diagnostic fields from OneSignal: lookup HTTP status, `onesignal_id`, aliases, and sanitized subscription details (`id`, `type`, `enabled`, `token` presence only).
   - Add `FireOSPush` to the accepted push subscription types in frontend/backend filtering so valid native push subscriptions are not accidentally ignored.

3. **Fix false “sent” success from marker rows**
   - Update `supabase/functions/send-push-notification/index.ts` so `platform = despia` marker rows do not count as successful web-push deliveries.
   - If OneSignal has no active recipient, return `success: false` even when a Despia marker row exists.

4. **Improve the demo page behavior**
   - Update `src/pages/DespiaPushDemo.tsx` so manual re-link polls a little longer, shows the exact reason when OneSignal lookup finds zero subscriptions, and does not show misleading “linked” copy until an enabled subscription is confirmed.
   - Keep send testing routed through the secure backend function.

5. **Validate**
   - Run a targeted lint check on the edited files.
   - Deploy/test the two backend functions and check their logs for OneSignal responses after the patch.