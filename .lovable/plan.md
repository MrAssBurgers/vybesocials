
# Fix Chat Typing Indicator & DM Updates Plan

## Issues Identified

### 1. Broken Typing Indicator in Conversation List
The conversation list shows a pink dot with "typing..." but this isn't connected to actual typing data. The `ConversationItem` component does not receive or display typing status from any realtime subscription.

### 2. DMs Not Updating When Messages Are Sent
There's a **query key mismatch**:
- `useInstantSend.ts` updates `['conversations', profile.id]`
- `useDMConversations.ts` uses `['dm-conversations', profile.id]`

When a message is sent, only `['conversations']` gets updated, but the conversation list uses `['dm-conversations']`, so it never receives the update.

### 3. Desktop Sidebar Typing Hardcoded
In `DesktopRightSidebar.tsx`, the `isTyping` property is hardcoded to `false` and never updated.

---

## Implementation Plan

### Phase 1: Fix Query Key Mismatch for Instant DM Updates

**File: `src/hooks/useInstantSend.ts`**
- Update `addOptimisticMessage` to also update the `['dm-conversations', profile.id]` query key
- This ensures both query caches stay in sync

**File: `src/hooks/useRealtimeMessages.ts`**
- In `useRealtimeConversations`, verify both query keys are being updated correctly

### Phase 2: Add Real-Time Typing Indicators to Conversation List

**Create new hook: `src/hooks/useConversationTyping.ts`**
- Subscribe to typing_indicators table globally for all conversations
- Track which conversations have active typing users
- Return a Map of conversationId -> typing user(s)

**File: `src/components/chat/ConversationList.tsx`**
- Import and use the new typing hook
- Pass typing state to `ConversationItem` component
- Display animated typing indicator when someone is typing

**File: `src/components/chat/ConversationList.tsx` (ConversationContent)**
- Add typing indicator display when `isTyping` is true
- Replace the last message preview with animated typing dots

### Phase 3: Fix Desktop Sidebar Typing

**File: `src/components/layout/DesktopRightSidebar.tsx`**
- Import the conversation typing hook
- Map typing state to the chat items
- Display proper typing animation

### Phase 4: Improve Typing Indicator Visuals

**File: `src/components/chat/ConversationList.tsx`**
- Add proper animated typing dots using the existing `typing-dot` CSS class
- Match the style used in `LivePresenceBar` and `InlineActivityBubble`

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useInstantSend.ts` | Add `dm-conversations` query key update |
| `src/hooks/useConversationTyping.ts` | **NEW** - Global typing subscription |
| `src/components/chat/ConversationList.tsx` | Add typing indicator to conversation items |
| `src/components/layout/DesktopRightSidebar.tsx` | Connect real typing data |

---

## Technical Details

### New Hook: `useConversationTyping`

```typescript
// Returns Map<conversationId, userId[]> of who is typing
export function useConversationTyping(conversationIds: string[]) {
  // Subscribe to typing_indicators for all conversations
  // Filter out own user
  // Return active typers per conversation
}
```

### Query Key Sync Fix

```typescript
// In useInstantSend.ts - update BOTH query keys
queryClient.setQueryData(['conversations', profile.id], ...);
queryClient.setQueryData(['dm-conversations', profile.id], ...);
```

### Typing Indicator in Conversation Item

```tsx
// When typing, show animated dots instead of last message
{isTyping ? (
  <span className="text-primary flex items-center gap-1">
    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: '0ms' }} />
    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: '150ms' }} />
    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: '300ms' }} />
    <span className="ml-1 text-xs">typing</span>
  </span>
) : (
  // ... existing last message display
)}
```

---

## Expected Results

1. **Instant message updates** - Sending a DM updates the conversation list immediately
2. **Real typing indicators** - Shows animated dots when someone is actually typing
3. **Consistent experience** - Both mobile and desktop show the same typing state
4. **No flickering** - CSS animations instead of framer-motion for stability
