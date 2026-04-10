

## Fix Three Issues: Sticker RLS, Long-Press Menu, Map Navigation

### Issue 1: Sticker Save 403 — Wrong User ID
**Root cause**: `useAddSticker` inserts `user_id: profile.id` (the `profiles` table primary key), but the RLS policy checks `user_id = auth.uid()`. The `profiles.id` is a separate auto-generated UUID, not the auth user ID. The auth user ID is stored in `profiles.user_id`.

**Fix**: In `src/hooks/useStickers.ts`, change all references from `profile.id` to `profile.user_id` when inserting/querying `user_stickers`.

### Issue 2: Long-Press Menu Not Showing on Media
**Root cause**: The `onContextMenu` handler (`handleContextMenu`) is defined in the message bubble component but never attached to the bubble `div`. On images specifically, `ChatMediaBubble` calls `e.preventDefault()` on the native context menu, but the parent bubble's `onTouchStart` long-press timer at 400ms can be disrupted by the browser's touch handling on `<img>` elements. The `handleContextMenu` should also be wired up as a fallback.

**Fix in `src/components/chat/ChatView.tsx`**:
- Add `onContextMenu={handleContextMenu}` to the message bubble `div` (line ~2247)
- This ensures right-click on desktop AND long-press fallback on mobile both trigger the popup menu

### Issue 3: Map Navigation Not Using Live Coordinates
**Root cause**: The navigate button already uses `sel.latitude` and `sel.longitude` with Google Maps directions. The coordinates come from `user_locations` which only has one record with `sharing_enabled: false`. The real issue is the location data isn't being updated frequently enough or sharing is disabled. The navigation code itself is correct — the coordinates just need to be fresh.

**Fix in `src/pages/FriendMap.tsx`**: The navigation code at line 976 already uses the friend's exact coordinates. No code change needed for navigation itself. However, to ensure the "Navigate" button works more reliably on mobile, we should also add `geo:` protocol support as a fallback for native map apps (Apple Maps on iOS, Google Maps on Android).

### Files Touched

| File | Change |
|------|--------|
| `src/hooks/useStickers.ts` | Use `profile.user_id` instead of `profile.id` for all DB operations |
| `src/components/chat/ChatView.tsx` | Add `onContextMenu={handleContextMenu}` to message bubble div |
| `src/pages/FriendMap.tsx` | Add `geo:` URI fallback for more reliable mobile navigation handoff |

