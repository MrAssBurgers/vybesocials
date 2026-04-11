

## Plan: Quick Add in DMs & Add Friends, NFC-only sharing, VybeMap fix

### 1. Verify Quick Add is showing under DMs
The `RecommendedFriendsSection` already exists at the bottom of the conversation list (lines 451-454 in ConversationList.tsx). It renders the Snapchat-style "Quick Add" with Add/X buttons — matching the uploaded screenshot. Need to verify it's rendering correctly and visible. If the section doesn't show (e.g. no suggested friends data), no code change needed — it's already wired up.

### 2. Remove FriendDrop from Add Friends page, keep only NFC
**File: `src/pages/NewMessage.tsx`**
- Remove the `FriendDrop` import and both usages (icon in header line 339, banner on line 346)
- Keep `NFCFriendShare` icon button in the header — this is the pure NFC tap-to-connect flow
- The NFC component already has the swap animation (`NFCSwapAnimation`) that auto-adds friends on discovery — same behavior as VybeDrop

### 3. Add Quick Add section to Add Friends page
**File: `src/pages/NewMessage.tsx`**
- The `FindFriendsSection` already exists and renders as "Quick Add" (line 158, line 400)
- It already shows below search when no query is active — this matches the request
- No changes needed here — it's already present

### 4. Fix VybeMap desktop black screen (definitive)
**File: `src/pages/FriendMap.tsx`**
- The `map-vignette` div was already removed (line 831 comment), but the CSS class is still defined (line 824) — minor cleanup
- The real issue: `forceContainerSize` sets explicit pixel dimensions with `position: absolute; inset: 0` which fights with the CSS classes. On desktop, the parent height may not resolve correctly
- **Fix**: Remove `forceContainerSize` entirely. Change the map container div to just use CSS `absolute inset-0` (already has this). Remove conflicting inline style overrides. Simplify the init check to just verify `el.offsetWidth > 0 && el.offsetHeight > 0`. Keep `ResizeObserver` for `invalidateSize` but without dimension overrides
- Remove `min-height: 100dvh!important` from `.leaflet-container` CSS — this makes the container taller than its parent on desktop where the sidebar reduces available height
- The outer wrapper should use `fixed inset-0` or `absolute inset-0` with proper z-indexing instead of `relative h-[100dvh]` which can collapse

### Files to modify
1. `src/pages/NewMessage.tsx` — Remove FriendDrop references (2 lines), keep NFC only
2. `src/pages/FriendMap.tsx` — Remove `forceContainerSize`, simplify container CSS, remove `min-height: 100dvh!important` from leaflet styles

### What's already working (no changes needed)
- Quick Add under DMs (`RecommendedFriendsSection` in ConversationList.tsx)
- Quick Add in Add Friends page (`FindFriendsSection` in NewMessage.tsx)
- NFC swap animation and auto-add behavior

