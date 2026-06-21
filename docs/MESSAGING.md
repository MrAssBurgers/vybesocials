# VYBE Messaging — Single Source of Truth (Phase 1)

Canonical architecture for DMs after the Phase 1 consolidation. All new messaging code should follow this document.

## Stack

| Layer | Implementation |
|-------|----------------|
| Auth | Firebase Auth |
| Database | Firestore (`messages`, `conversations`, `conversation_members`) |
| Realtime | Firestore `onSnapshot` via `dmScopedMessageRealtime` |
| Send | `insertDmMessage()` in `src/lib/dmSendCore.ts` |
| Optimistic UI | `useInstantSend` in `src/hooks/useInstantSend.ts` |
| Offline queue | `src/lib/dmOutbox.ts` (IndexedDB, flush on reconnect) |
| Push | Cloud Function `onDmMessageCreated` → OneSignal + FCM |
| Storage | Firebase Storage (`chat-media` bucket) |

## Data model (current)

```
conversations/{conversationId}
messages/{messageId}          ← flat collection, field conversation_id
conversation_members/{docId}
```

Subcollections (`conversations/{id}/messages`) are **future** — not required for instant delivery.

## Send pipeline (the only path)

```
User taps Send
  → useInstantSend.addOptimisticMessage()     // instant bubble + conv list bump
  → insertDmMessage()                           // Firestore insert + retry + cloud fallback
  → replaceOptimisticMessage()                  // swap temp-* id for server id
  → sendDmBroadcastMessage()                    // cross-tab instant (optional)
  → bumpConversationUpdatedAt()
```

On **network failure**: `outboxEnqueue()` keeps the optimistic bubble; `dmOutbox` flushes via the same `insertDmMessage()`.

**Do not** call `db.from('messages').insert()` directly from UI code — use `insertDmMessage` or `useInstantSend`.

## Receive pipeline (the only path)

```
App mount
  → useGlobalRealtimeMessages()
      → setupScopedMessageRealtime()   // per-conversation Firestore listeners
      → subscribeDmBroadcastMessages() // peer messages only (not own sends)
```

When viewing a thread:

- **Own sends**: optimistic UI + `replaceOptimisticMessage` — Firestore INSERT echo is **skipped**
- **Peer sends**: Firestore listener → `appendIncomingMessage` → React Query cache

Conversation list updates happen in `patchConversationLists` inside `dmScopedMessageRealtime`.

## React Query keys

| Key | Purpose |
|-----|---------|
| `['messages', conversationId]` | Message thread (canonical) |
| `['dm-conversations', profileId]` | DM sidebar list |
| `['conversations', profileId]` | Legacy alias — both patched on send/receive |

Helpers: `src/lib/messagesQueryKey.ts`

## Files — use vs avoid

| Use | Avoid / removed |
|-----|-----------------|
| `src/lib/dmSendCore.ts` | Direct `db.from('messages').insert` in components |
| `src/hooks/useInstantSend.ts` | ~~`useOptimisticMessages`~~ (deleted) |
| `src/hooks/useGlobalRealtimeMessages.ts` | ~~`useSendMessage`~~ (removed) |
| `src/lib/dmScopedMessageRealtime.ts` | Duplicate message UPDATE listeners in `useRealtimeMessages` |
| `src/lib/dmOutbox.ts` | Second parallel send implementations |
| `src/lib/dmBroadcast.ts` | `src/lib/firebase/messages.ts` (unused parallel API) |

`useRealtimeMessages` — **reactions + views only** (no message INSERT/UPDATE/DELETE).

## Vybe snaps / share / admin

Special senders still upload media locally, then call `insertDmMessage()`:

- `ChatView.handleVybeSend`
- `src/lib/sendShareToUser.ts`
- `src/lib/callChatMessages.ts` (call events)

## Two-device test checklist

1. **Instant text** — Device A sends "test"; Device B sees it within ~1s without refresh.
2. **No duplicate bubbles** — Sender sees exactly one bubble (temp → real swap, no echo).
3. **Conv list** — Both devices show updated preview + timestamp immediately.
4. **Offline** — Airplane mode → send → bubble stays → reconnect → message delivers once.
5. **Vybe snap** — Send image/video vybe; appears on both sides with correct media.
6. **Permission edge** — New DM thread first message succeeds (cloud fallback if rules lag).
7. **Typing / presence** — Separate from messaging; should not block send.

## Phase 2+ (not in scope)

- Message subcollections migration
- Agora/Stream (calls stay on LiveKit for now)
- Full removal of Supabase-shaped `db.from()` shim
- E2E encryption revival
