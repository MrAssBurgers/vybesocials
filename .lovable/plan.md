

## Plan: Snapchat-style Add Friends, NFC Scanning UI, Recommended Friends, and VybeMap Fix

### 1. Remove Quick Add from DMs area

**File: `src/components/chat/ConversationList.tsx`**
- Remove the `QuickAddRow` component rendering (lines 372-382 — "Online" horizontal row)
- Remove the `MutualFriendsQuickAdd` component rendering (lines 384-389)
- Remove related imports (`QuickAddRow`, `MutualFriendsQuickAdd`)
- Keep the `onlineFriendsForQuickAdd` logic only if needed elsewhere; otherwise clean up

### 2. Add Snapchat-style Add Friends button in Chat header

**File: `src/components/chat/ConversationList.tsx`**
- Replace the current `NewChatDialog` (Plus icon that opens a dialog) with a dedicated **UserPlus icon button** in the header actions area (line 307-325) that navigates to `/messages/new` (the Add Friends page)
- Remove the `NewChatDialog` component entirely from this file since it's redundant with the Add Friends page

### 3. Revamp Add Friends page with Snapchat-like UI

**File: `src/pages/NewMessage.tsx`**
- Add an **"Added Me"** section at the top showing incoming friend requests (reuse `useFriendRequests` hook) with Accept/X buttons — matching the Snapchat screenshot layout
- Add a **"View X More"** button when there are many incoming requests
- Add an **"Invite your friends!"** banner with share functionality
- Keep the existing search bar and search results below
- Add a **"Find Friends"** section below with suggested users from `useSuggestedUsers` (already exists in `MutualFriendsQuickAdd`) showing "+ Add" and "X" dismiss buttons
- Include NFC and VybeDrop buttons in the header (already present)

### 4. Add Recommended Friends section under DMs

**File: `src/components/chat/ConversationList.tsx`**
- After the conversation list items, add a "Recommended" or "Quick Add" horizontal section (like Snapchat's second screenshot) showing suggested friends based on mutuals
- Use the existing `useSuggestedUsers` hook or `useSuggestedFriends` from `useFriendsOfFriends`
- Each card shows avatar, name, mutual count, "+ Add" button, and "X" dismiss
- This replaces the old Quick Add that was removed from the top

### 5. NFC Scanning UI enhancement

**File: `src/components/friends/NFCFriendShare.tsx`**
- The scanning UI already exists (the `mode === 'sharing'` state shows pulsing rings and "NFC Scanning Active" text)
- Enhance it to match a more polished scanning experience: add a radar/sonar-style sweep animation
- When a device is found, the existing swap animation (`NFCSwapAnimation`) already triggers and auto-adds the friend — this matches VybeDrop behavior
- No functional changes needed, just visual polish on the scanning state

### 6. Fix VybeMap desktop black screen (definitive)

**File: `src/pages/FriendMap.tsx`**

Root cause analysis: On desktop, the AppLayout wraps content in a flex layout. The `<main>` has `h-screen overflow-hidden`, and the inner `<div>` has `h-full`. The FriendMap's outer div uses `relative h-[100dvh]` which should work, but the `forceContainerSize` function overrides with `position: absolute; inset: 0` AND explicitly sets pixel width/height — this can conflict with the Leaflet container's own CSS that also sets `min-height: 100dvh!important`.

Fix approach:
- Remove `forceContainerSize` — it's fighting with CSS classes
- Change the map container div to use `absolute inset-0` without the `h-full min-h-[100dvh]` overrides
- Simplify the Leaflet container CSS to just `height:100%!important;width:100%!important;background:hsl(var(--muted))`
- Remove the `min-height:100dvh!important` from `.leaflet-container` CSS (this causes the container to be taller than its parent on desktop where sidebar reduces available height)
- In `initMap`, just check `el.offsetWidth > 0 && el.offsetHeight > 0` instead of force-setting sizes
- Keep the `ResizeObserver` for `invalidateSize` calls but remove the dimension overrides
- Remove `map-vignette` overlay (the dark radial gradient) as it contributes to the "black layer" appearance, or make it much more subtle

### Files to modify
1. `src/components/chat/ConversationList.tsx` — Remove Quick Add sections, change NewChatDialog to simple nav button, add Recommended section at bottom of DMs
2. `src/pages/NewMessage.tsx` — Add Snapchat-style "Added Me" section with incoming requests, invite banner, and Find Friends section  
3. `src/components/friends/NFCFriendShare.tsx` — Polish scanning UI with radar animation
4. `src/pages/FriendMap.tsx` — Fix desktop black screen by simplifying container sizing and removing conflicting CSS

