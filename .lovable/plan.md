
# Fix VYBE Snap "Opened" Bug

## Problem Identified
When you send a VYBE snap, it immediately shows "Opened" to you (the sender) before the recipient has actually tapped to view it.

## Root Cause
The auto-mark-as-read logic in `ChatView.tsx` (lines 277-294) automatically marks ALL incoming messages as "viewed" when the chat is opened. This includes VYBE messages, which should only be marked as viewed when the recipient explicitly taps "TAP TO VIEW".

**The flow causing the bug:**
1. Sender sends a VYBE message
2. Recipient's chat receives the message via realtime
3. The auto-mark effect runs and calls `markViewed.mutate()` for the VYBE
4. This inserts a row into `message_views` table
5. Sender sees `message.views.length > 0` so UI shows "Opened" immediately

## Solution
Exclude VYBE messages (`media_type === 'vybe'`) from the auto-mark-as-read logic. VYBEs should only be marked as viewed when:
1. The recipient explicitly taps "TAP TO VIEW"
2. The `VybeViewer` component opens and calls `onViewed()`

---

## Technical Changes

### File: `src/components/chat/ChatView.tsx`
**Location:** Lines 277-294 (auto-mark messages as read effect)

**Change:** Add a filter to exclude VYBE messages from auto-marking:

```tsx
// Auto-mark messages as read (EXCEPT VYBEs which require explicit tap-to-view)
useEffect(() => {
  if (!messages || !profile?.id || !conversationId) return;

  const unreadMessages = messages.filter((msg) => {
    if (msg.sender_id === profile.id) return false;
    if (hasMarkedReadRef.current.has(msg.id)) return false;
    
    // Skip VYBE messages - they require explicit tap-to-view
    if (msg.media_type === 'vybe') return false;
    
    const hasMyView = msg.views?.some((v) => v.user_id === profile.id);
    return !hasMyView;
  });

  if (unreadMessages.length === 0) return;

  unreadMessages.forEach((msg) => {
    hasMarkedReadRef.current.add(msg.id);
    markViewed.mutate(msg.id);
  });
}, [messages, profile?.id, conversationId, markViewed]);
```

---

## Expected Behavior After Fix

**Sender's view:**
1. Sends VYBE → Shows "Sent" state with gradient background
2. When recipient taps and views → Shows "Opened" state (via realtime update)

**Recipient's view:**
1. Receives VYBE → Shows "TAP TO VIEW" button with animated gradient
2. Taps to view → VybeViewer opens fullscreen with 5-second timer
3. After viewing → Shows "Opened" state (cannot view again)
