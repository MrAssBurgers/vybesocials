# VYBE Notifications — Phase 2 (Single Source of Truth)

## Stack

| Channel | Implementation |
|---------|----------------|
| **Phone push (native)** | OneSignal + FCM via Cloud Functions |
| **Web push (PWA)** | FCM web push + `public/sw.js` |
| **In-app DM alerts** | `foregroundDmNotification` (from `dmScopedMessageRealtime`) |
| **Bell menu (social)** | Firestore `notifications` collection |
| **Tap routing** | `notificationActions.ts` → `NotificationActionRouter` |

## Push dispatch (server only)

| Event | Trigger | Push | Bell row |
|-------|---------|------|----------|
| DM / group message | `onDmMessageCreated` | Yes (`dispatchDmPushToProfile`) | **No** — lives in chat list |
| Incoming call | `onCallCreated` | Yes (`dispatchCallPushToProfile`) | **No** |
| Like / comment / follow / friend request | Client inserts `notifications` row | `onSocialNotificationCreated` | Yes |
| Missed call | DM `call_event` only | No bell row | **No** |

**Never** call push from the client for cross-user events. `src/lib/pushNotifications.ts` is legacy/unused.

## Receive paths

### DMs (foreground)
```
Peer message INSERT (dmScopedMessageRealtime)
  → maybeShowForegroundDmNotification()
      → dedupe tag dm:{convId}:{msgId}
      → sound + in-app toast (MessageNotificationToast)
      → web Notification API only if tab hidden AND not native shell
```

### DMs (background / other device)
```
onDmMessageCreated → OneSignal/FCM with tag vybe-dm-{conversationId}
```

### Social (bell)
```
Client inserts notifications row
  → onSocialNotificationCreated → push with deep link
  → useNotifications realtime → in-app toast (if app open, deduped)
```

## Deep links (`buildNotificationRoute`)

| Type | Route |
|------|-------|
| `dm` / `group_message` | `/messages/{conversationId}` |
| `call` | `/messages/{conversationId}?call={callId}` |
| `like` / `comment` / `mention` | `/p/{postId}` |
| `friend_request` | `/notifications?tab=requests` |
| `friend_accepted` | `/notifications` |

All tap handlers should use:
- `normalizeNotificationPayload()` → `buildNotificationRoute()` → `navigateFromNotification()`

Wired in: `NotificationActionRouter`, `DespiaOneSignalSync`, `useNativeFeatures`, service worker.

## Dedupe

`src/lib/inAppNotificationDedupe.ts` — 30s window per tag:
- DMs: `dm:{conversationId}:{messageId}`
- Bell: `bell:{type}:{notificationId}`
- Push: `collapse_id` / `tag` on OneSignal (`vybe-dm-{conv}`, `vybe-{type}-{id}`)

## User preferences

Cloud Functions check `notification_preferences`:
- `dms_enabled`, `calls_enabled`, `likes_enabled`, `comments_enabled`, `follows_enabled`

## Files

| Use | Purpose |
|-----|---------|
| `functions/src/pushTriggers.ts` | DM + call + social push triggers |
| `src/lib/notificationActions.ts` | Normalize payload + routes |
| `src/lib/foregroundDmNotification.ts` | Foreground DM toast/sound |
| `src/lib/inAppNotificationDedupe.ts` | Prevent double toasts |
| `src/components/notifications/NotificationActionRouter.tsx` | Central tap handler |
| `src/components/notifications/DespiaOneSignalSync.tsx` | Despia + OneSignal web link |

## Test checklist

1. **DM background** — B sends to A; A's phone gets push; tap opens thread.
2. **DM foreground** — A in Home (not thread); toast appears once; no duplicate sound.
3. **DM in thread** — No toast/sound while viewing that chat.
4. **Like** — Push on phone + bell row; tap opens post.
5. **Friend request** — Push + bell; tap opens Requests tab.
6. **Call** — Ring push only (no bell row); tap opens call screen.
7. **Missed call** — Only in DM as call_event; not in bell menu.
8. **Native (Despia)** — No duplicate web Notification when OS push already shown.

## Deploy

After changes to push triggers:
```bash
cd functions && npm run build
firebase deploy --only functions:onDmMessageCreated,functions:onCallCreated,functions:onSocialNotificationCreated --project vybe-daaab
```

Web: Lovable Publish → vybehub.app
