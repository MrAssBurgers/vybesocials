## Goal
The Chat page on the live app flickers/glitches constantly for your account. Fix the root causes without touching any unrelated logic (DM data, accounts, RLS).

## Root causes identified

1. **Auto-create-friend-DMs infinite render loop** (`src/hooks/useDMConversations.ts`)
   - The `ensureConversationsForFriends` callback depends on `conversationsQuery.data`.
   - Every refetch returns a new array reference → the callback identity changes → the `useEffect` that runs it fires again → it `invalidateQueries(['dm-conversations'])` whenever it creates anything (and even on benign re-runs the closure churn forces re-evaluations across 14 ConversationItems).
   - Net effect: the whole conversation list re-renders in a tight loop = visible flicker.

2. **`refetchOnMount: 'always'`** on the DM query
   - Forces a network refetch every time `ConversationList` mounts (tab switches, route returns, drawer opens). Combined with `placeholderData: prev`, `isFetching` toggles → list flashes.

3. **Global realtime over-invalidation** (`src/hooks/useGlobalRealtimeMessages.ts`)
   - When ANY message lands in a conversation not yet in cache, it invalidates `['dm-conversations']` and `['conversations']` even though the optimistic patch already updated the cache. This can re-pull the full list mid-render.

## Changes

### 1. `src/hooks/useDMConversations.ts` — stop the loop
- Replace `refetchOnMount: 'always'` with `refetchOnMount: true` (only refetch when stale).
- Stabilize the auto-create effect:
  - Use a `useRef` to track the last `conversationsQuery.dataUpdatedAt` we processed and bail out if unchanged.
  - Drop `conversationsQuery.data` from the effect's dep array; read it via `queryClient.getQueryData` inside the function instead.
  - Only call `invalidateQueries(['dm-conversations', profile.id])` (scoped key) after auto-creation, and only if at least one convo was actually created — already the case, but ensure the call happens at most once per friends-list change by gating on a `processedFriendsHashRef`.
- Memoize `friendsWithoutConvos` derivation so identical friend lists don't re-trigger work.

### 2. `src/hooks/useGlobalRealtimeMessages.ts` — surgical invalidation
- When a new message arrives for a conversation already in cache, the existing `setQueryData` patch is sufficient → remove the now-redundant `invalidateQueries` fallback for that case.
- Keep the invalidation only for the unknown-conversation branch (legitimately new convo).
- Also debounce the unknown-conversation invalidate by 300ms so a burst of messages doesn't trigger N refetches.

### 3. `src/components/chat/ConversationList.tsx` — render stability
- Wrap the per-conversation render rows (`filteredPinned.map` / `filteredUnpinned.map`) in `React.memo`'d `ConversationItem` if not already memoized; if it is, just ensure the props passed are stable (move inline lookups like `userStoryMap.get(...)` into a `useMemo` keyed by the conversation id list and the map).
- Make `onTrash` / `onClick` callbacks stable via `useCallback` keyed by `conv.id`.

### 4. Light verification
- Reload `/messages` in the live app and watch the React render count for `ConversationItem` (or just visually confirm no flicker).
- Confirm new DMs still appear instantly (realtime patch still runs).

## Out of scope
- No RLS or DB changes.
- No changes to the empty-state logic, the "VYBE-AI" row, the Notes row, accepted friend requests, or auto-create-friend-DM behavior itself (only how often it fires).
- No changes to account/auth.

## Files
- `src/hooks/useDMConversations.ts`
- `src/hooks/useGlobalRealtimeMessages.ts`
- `src/components/chat/ConversationList.tsx`