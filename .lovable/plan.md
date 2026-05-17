## Fix DMs (revert offline-loading regressions)

The offline-loading changes left DMs reading from stale cache and never re-fetching on mobile. Fix without ripping everything out: revert the two React Query configs that caused it, keep the outbox so messages still queue if you're actually offline.

### Changes

**`src/hooks/useMessages.ts`** — two queries:

1. `useDMConversations` (~line 222–231): replace
   ```
   refetchOnMount: false
   networkMode: 'offlineFirst'
   ```
   with
   ```
   refetchOnMount: 'always'
   networkMode: 'online'
   ```
   Keep `gcTime` cache + `placeholderData` so the list still shows instantly while it refetches.

2. `useMessages(conversationId)` (~line 277–286): same swap — `refetchOnMount: 'always'`, `networkMode: 'online'`. Keep cache + placeholder so threads open instantly but always re-pull truth from the server.

**Outbox stays as-is.** The `outboxEnqueue` in `useSendMessage` only fires on real network errors (catch block), so genuine offline sends still queue and flush on reconnect — that piece was never the bug.

### Why this fixes it

`offlineFirst` + `refetchOnMount: false` means React Query serves whatever's in cache and skips the network request entirely if it considers the cache fresh. On Despia's WebView, the network detection sometimes flags the app as offline mid-session, which froze conversation lists and threads on an old snapshot. Going back to standard `online` mode + `refetchOnMount: 'always'` restores the previous behavior: instant cache paint, immediate background refetch, realtime keeps it live.

### Push notifications (OneSignal via Despia)

Already wired correctly:
- `send-push-notification` edge function posts to OneSignal with `include_external_user_ids`
- Despia auto-registers the device and `DespiaOneSignalSync` binds the OneSignal external user ID to `profile.id` at sign-in
- DMs (`sendMessagePush`), calls (`sendCallPush`), friend requests, daily briefs, smart pings all already call this same path

I'll verify each call site after the DM fix lands; no changes expected unless something is bypassing `send-push-notification`.

### What I am NOT touching

- DM UI components
- Realtime subscriptions
- Send flow / optimistic bubbles
- Outbox library
- Any other hook
