
# Fix: Enable Real-Time DMs Like Snapchat/Instagram

## Problem Diagnosed

Messages are not appearing instantly because the `messages` table is **not published for real-time updates**. The subscription in `useGlobalRealtimeMessages` is properly connected, but Postgres isn't sending any events.

**Evidence:**
Querying `pg_publication_tables WHERE pubname = 'supabase_realtime'` returned:
- `calls`
- `live_activity`
- `friend_drops`
- `user_backgrounds`

The `messages` table is missing from this list.

---

## Solution Overview

1. Add the `messages` table to the realtime publication
2. Also add `conversations` table for conversation list updates
3. Add a fallback polling mechanism in case realtime drops
4. Improve deduplication to prevent duplicate messages

---

## Implementation Steps

### Step 1: Database Migration - Enable Realtime

Add the `messages` and `conversations` tables to the Supabase realtime publication so that INSERT, UPDATE, and DELETE events are broadcast to all connected clients.

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
```

This is the critical fix that will make DMs update instantly.

---

### Step 2: Improve Global Realtime Handler

Update `src/hooks/useGlobalRealtimeMessages.ts` to be more robust:

**A. Better deduplication**
- Track recently processed message IDs to prevent duplicates (Supabase can send duplicate events)
- Use a 30-second sliding window for deduplication

**B. Faster cache injection**
- Remove the async profile fetch for sender - use cached profile from conversation members when available
- Only fetch profile if not in cache

**C. Retry logic on error**
- When `CHANNEL_ERROR` occurs, properly retry the subscription with exponential backoff
- Track connection state and log for debugging

---

### Step 3: Add Polling Fallback

Add a background polling mechanism to `useMessages.ts` that activates only when the realtime connection drops. This ensures messages still arrive even if WebSocket connection fails.

**Fallback behavior:**
- Check connection status every 30 seconds
- If realtime is disconnected, poll every 3 seconds
- When realtime reconnects, stop polling
- Never duplicate messages (use deduplication)

---

### Step 4: Ensure Sender Messages Update Instantly

The current `useInstantSend` hook adds optimistic messages correctly for the sender. But we need to ensure the real message (with server ID) replaces the temp ID properly without duplication.

**Improvement:**
- When the realtime handler receives a message that matches a pending temp message (same content, sender, conversation, within 5 seconds), ignore it (already shown optimistically)
- This prevents the sender from seeing their message twice

---

## Files That Will Change

1. **Database migration** (new file)
   - Enable realtime for `messages` and `conversations` tables

2. **`src/hooks/useGlobalRealtimeMessages.ts`**
   - Add message deduplication with sliding window
   - Add exponential backoff retry on channel errors
   - Skip processing for messages we already optimistically added

3. **`src/hooks/useMessages.ts`** (minor)
   - Add optional fallback polling when realtime drops (gated behind connection state)

---

## Pass Conditions

After this fix:
- Sender sees message instantly (optimistic UI - already works)
- Receiver sees message instantly (realtime - will work after migration)
- DM list updates in real time for both users
- No duplicate messages appear
- No manual refresh ever required
- Works even if realtime connection temporarily drops (polling fallback)

---

## Technical Details

### Why This Will Work

The current architecture is correct - the subscription is set up properly. The only missing piece is the database-level publication. Once `messages` is added to `supabase_realtime`, every INSERT will broadcast to all subscribed clients.

The global handler at the App level ensures:
- All users receive updates regardless of what page they're on
- Messages are injected into the correct conversation cache
- Conversation lists are updated with new last_message previews
- Notification sounds play when not viewing the conversation

### Performance Considerations

- Single global subscription (efficient)
- Direct cache mutation (no refetch needed)
- Deduplication prevents wasted renders
- Polling only activates as fallback, not primary
