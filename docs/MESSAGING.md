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
  → insertDmMessage()                         // ALWAYS → sendDmMessage callable
  → replaceOptimisticMessage()                // swap temp-* id for server id
  → sendDmBroadcastMessage()                  // cross-tab instant (optional)
  → bumpConversationUpdatedAt()
```

`insertDmMessage()` in `src/lib/dmSendCore.ts` **only** invokes the `sendDmMessage` Cloud Function (`functions/src/dmSend.ts`). There is no client Firestore message create path.

Firestore rules deny `messages` create from clients (`allow create: if false`). Admin SDK writes from the callable bypass rules.

`sendDmMessage` is the single enforcement point for:
- Blocked-user checks (`blocked_users`, both directions, before membership writes)
- Rate limits (60/min/uid)
- Membership validation / repair
- Message schema + view-mode validation
- Media URL ownership / allowlist checks
- Idempotent reconnect retries via `client_message_id` (optimistic temp id / outbox id)
- Lightweight `dm_send_audit` trail

On **network failure**: `outboxEnqueue()` keeps the optimistic bubble; `dmOutbox` flushes via the same `insertDmMessage()` and reuses `client_message_id` so reconnect retries do not duplicate. Blocked / validation failures are permanent (no auto-retry); rate limits are transient.

**Do not** call `db.from('messages').insert()` — it will be denied by rules. Use `insertDmMessage` or `useInstantSend`.

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

## Phase 1 DM extensions (2026-07-12)

Additional Firestore collections (rules + indexes in repo):

| Collection | Purpose |
|------------|---------|
| `scheduled_messages` | Client schedules; CF `processDueScheduledMessages` delivers |
| `locked_chats` | Per-user lock metadata; `LockedChatGate` on web |
| `dm_reminders` | Follow-up reminders (`useDmReminders`) |
| `message_transcripts` | Voice transcription status + text |
| `message_media_rules` | Optional access policy doc per message |
| `screenshot_notifications` | Capture notification fan-out |
| `capture_events` | Extended with `event_key` dedupe; CF `onCaptureEventCreated` |

Cloud Functions: `onMessageViewCreated`, `transcribeVoiceMessage`, `processDueScheduledMessages`, `onCaptureEventCreated`.

Active inbox UI: `src/features/dms/DMInboxPage.tsx` (mounted from `src/pages/Messages.tsx`), with `src/components/chat/dm-inbox/DmInboxSafeList.tsx` as its error-boundary fallback. Both render the same `DMHeader` / `DMCategoryTabs` / `DMConversationList` components. `ConversationList.tsx` + `DMsHeader.tsx` are unrouted legacy code kept only for rollback (see Messages redesign section below).

## Messages redesign — `dm_inbox_entries` projection (2026-07-12)

The inbox is migrating from client-side N+1 reads (membership + message + profile fan-out, in `loadDMConversations.ts`) to a single server-maintained Firestore projection: one doc per `(viewer, conversation)` pair with everything a row needs to render already denormalized.

### Collection

```
dm_inbox_entries/{viewerId}_{conversationId}
  viewer_id, conversation_id, conversation_type ('direct' | 'group')
  display_name, username, avatar_url, secondary_avatar_url, other_profile_id, member_ids
  preview_text, latest_message_id, latest_message_type, latest_sender_id, latest_sender_name,
  latest_message_at, delivery_status
  unread_count, mention_count, is_unread, needs_reply
  is_pinned, pin_order, is_muted, is_archived
  streak_count, relationship_badge ('close_friend' | 'new_friend' | null), is_verified
  search_tokens[]            // for array-contains search, see MessagesSearchPage
  updated_at, projection_version
```

Firestore rules (`firestore.rules`): viewer can only `read` their own `viewer_id` row; `create/update/delete` are **server-only** (`allow write: if false`) — the projection is entirely Cloud-Function-maintained, never trusted from the client.

### Server side — `functions/src/dmInboxProjection.ts`

- `buildEntryForViewer(conversationId, viewerId)` recomputes one viewer's row from `conversations` + `conversation_members` + latest non-deleted `messages` doc + profiles. `upsertInboxEntry` writes it (or deletes the row if the viewer is no longer a member); `rebuildConversationInbox` fans that out to every member.
- Triggers keep it fresh automatically — no manual refresh needed for the normal message lifecycle:
  - `onDmInboxMessageCreated` / `onDmInboxMessageUpdated` / `onDmInboxMessageDeleted` (`messages/{messageId}`) — new/edited/deleted messages.
  - `onDmInboxMemberWritten` (`conversation_members/{docId}`) — covers mute/pin/archive toggles **and** `last_read_at` updates (marking a thread read recomputes `unread_count`/`is_unread`/`needs_reply` for that viewer).
  - `onDmInboxConversationWritten` (`conversations/{cid}`) — name/avatar/group membership changes.
- `backfillDmInboxEntries` (admin-only callable) — resumable cursor-based backfill for existing conversations.
- `refreshMyDmInboxEntry` (rate-limited callable) — viewer-triggered force refresh for one conversation, for the rare case a client suspects its row is stale.

### Client side

- `src/lib/dmInboxProjection.ts` — doc mapping (`mapInboxEntryDoc`) + `LoadedDMConversation` shim (`projectionToLoadedConversation`) so projection rows can flow through the same filter/sort code (`dmInboxOrganize.ts`) as the legacy loader, plus `searchDmInboxEntriesByToken()` (array-contains on `search_tokens`, used by `MessagesSearchPage`).
- `src/features/dms/useDmInboxProjection.ts` — `onSnapshot` subscription hook for the viewer's `dm_inbox_entries` rows.
- `src/lib/dmInboxShadowCompare.ts` — diffs the projection against the legacy loader's output (missing rows, unread mismatches, stale latest message, ordering) without switching the UI over; used while `dm_inbox_projection_shadow` is on.
- `src/lib/dmInboxFeatureFlags.ts` — rollout flags (localStorage override → `VITE_*` env var → default):

  | Flag | Default | Purpose |
  |------|---------|---------|
  | `dm_inbox_projection_read` | `false` | Read `dm_inbox_entries` at all (gates the shim + shadow compare) |
  | `dm_inbox_projection_shadow` | `true` | Run the shadow compare in the background (logging only, never shown to the user) |
  | `dm_inbox_redesign_ui` | `false` | Actually render inbox rows sourced from the projection (`true` requires `dm_inbox_projection_read` too) |
  | `dm_inbox_legacy_fallback` | `true` | Keep the legacy N+1 loader as a safety net alongside the projection |

  **Rollout order:** ship with `read` on + `shadow` on + `redesign_ui` off → watch shadow-diff logs across a full traffic cycle → flip `redesign_ui` on → once stable, flip `legacy_fallback` off and only then consider deleting `ConversationList.tsx`/`DMsHeader.tsx`/the N+1 loader path.

### Testing

- `scripts/test-dm-inbox-rules.mjs` — Firestore emulator rules test (viewer can read own row, cannot write, cannot read another viewer's row).
- `src/lib/dmInboxShadowCompare.test.ts` — doc mapping + shadow-diff unit tests.
- `src/lib/dmInboxOrganize.test.ts` / `src/lib/dmInboxFilterPersistence.test.ts` — filter/sort behavior for both the legacy-loader (`filterConversationsForTab`) and projection (`filterPreviewsForFilter`) shapes, plus filter/scroll/order persistence.

## Offline outbox — failure surfacing

`src/lib/dmOutbox.ts` queues sends that fail for a transient reason (offline, timeout, fetch error) and retries automatically on reconnect (`onReconnect`, `online`, `visibilitychange`, `app-resumed`). Items that fail for a **non-transient** reason (validation, permission, etc.) are marked `status: 'failed'` instead of being silently dropped, and a `vybe:dm-outbox-failed` window event is dispatched. `App.tsx` listens for that event, flags the corresponding message bubble `_failed` (reusing the existing retry-bubble UI in `ChatView`), and shows a toast. Tapping retry on that bubble calls `retryFailedItem(tempId)` (resets the queued item and resends from its stored payload — works even if `ChatView` remounted since it doesn't depend on in-memory `pendingMessagesRef`), falling back to the in-session `useInstantSend().retry()` for failures that never touched the outbox.

## Phase 2+ (not in scope)

- Message subcollections migration
- Agora/Stream (calls stay on LiveKit for now)
- Full removal of Supabase-shaped `db.from()` shim
- E2E encryption revival
