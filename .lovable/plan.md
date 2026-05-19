## Plan

1. **Stop sending to stale/unverified player IDs in the demo**
   - Update `DespiaPushDemo` so “Send” uses the existing backend push function instead of calling OneSignal directly from the browser.
   - Remove the direct REST key usage from the page so the demo targets the same path real app notifications use.
   - Treat the “player ID” box as diagnostic only; don’t use a native-returned ID as `include_subscription_ids` unless OneSignal lookup confirms it is an enabled push subscription.

2. **Make the backend OneSignal send result accurate**
   - In `send-push-notification`, parse the OneSignal response JSON and mark delivery successful only when the HTTP response is OK, there are no `errors`, and recipients are not `0`.
   - Keep logging the exact OneSignal response so errors like `All included players are not subscribed` are visible in audit logs.
   - Prevent `push_tokens` Despia marker rows from making a failed OneSignal send look successful.

3. **Harden Despia linking and target resolution**
   - Keep linking by `profiles.id` as the OneSignal `external_id`.
   - Re-run the Despia native link command after permission is requested, then poll OneSignal’s user lookup for an enabled push subscription.
   - Show “linked” only when either an enabled subscription is found or the backend accepts the external_id send path; otherwise show a clear “permission/subscription not active yet” state instead of a false success.

4. **Validation**
   - Run a targeted lint check on the edited files.
   - Check recent `send-push-notification` logs after the patch path is in place to confirm OneSignal errors are reported correctly.