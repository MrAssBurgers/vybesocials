## Push Notification Opt-In Prompt (only when OFF)

A friendly modal that appears **only when push notifications are currently disabled**, prompting the user to turn them on. One tap enables them via the existing native (Despia) or web push flow.

### Show conditions (ALL must be true)

- User is signed in (`profile?.id` exists)
- `usePushNotifications().isSupported === true`
- `isCheckingSubscription === false` (finished initial check)
- `isSubscribed === false` (no token row in `push_tokens` for this platform)
- `permission !== 'denied'` (if browser/OS-denied, don't nag — they must change OS settings)
- Not snoozed in the last 7 days (`localStorage` key `vybe_push_prompt_snoozed_until`)

If any condition fails → modal never renders.

### What to build

1. **`src/components/notifications/EnablePushPrompt.tsx`**
   - Centered Dialog, max-w-sm, dark glass aesthetic matching brand
   - Bell icon, headline "Turn on notifications", body explaining DMs, calls, daily briefs, friend activity
   - Primary button "Enable" → calls `subscribe()` from `usePushNotifications` (handles Despia OS prompt + token registration on mobile, VAPID on web)
   - Ghost button "Not now" → sets snooze timestamp (now + 7 days) and closes
   - On successful subscribe → close modal (toast already fires inside the hook)

2. **`src/hooks/useEnablePushPrompt.ts`**
   - Encapsulates the show-conditions logic above
   - Returns `{ open, onEnable, onDismiss }`
   - 3-second delay after mount before first show so it doesn't slam on cold load

3. **Mount in `src/App.tsx`** (authenticated tree, next to `DespiaOneSignalSync`)
   - Single render at app root; component self-gates visibility

### Technical notes

- Reuses existing `usePushNotifications` hook — no new push logic
- Live-reactive: if user disables push elsewhere, `isSubscribed` flips to false and prompt becomes eligible again (after snooze expires)
- Snooze key: `vybe_push_prompt_snoozed_until` (ISO timestamp)
- No DB changes, no edge function changes
