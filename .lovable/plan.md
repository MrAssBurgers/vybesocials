

## Fix Map "No People Found", Note Bubble Visibility + GIF Support, and VybeSnap Camera Revamp

### Problem Summary

1. **Map shows "No people found"** — Friends don't have rows in `user_locations` because they haven't toggled sharing on their devices. The map should handle this gracefully by showing friends who are online but not sharing, and improving the empty state messaging.

2. **Note bubble is clipped/hidden** — The speech bubble sits at `-top-7` with the parent having `overflow-x-auto` on the container, which clips the bubble. Needs higher z-index and overflow-visible fix.

3. **Can't add GIFs to notes** — Currently notes are plain text only. Need to add a GIF picker (using Tenor/GIPHY API) so users can attach a GIF URL to their note.

4. **VybeSnap camera needs full Snapchat feature parity** — Missing: lens carousel, AR filter placeholders, multi-snap timeline, music/sound attachment, timer, grid overlay, HDR toggle, night mode, selfie flash (screen flash for front cam), gallery/memories shortcut, friend quick-send row, and category tabs (Moments, Favorites, For You).

---

### Plan

#### 1. Fix Map Empty State
**File: `src/pages/FriendMap.tsx`**
- Change `useFriendLocations` to also show friends who are NOT sharing but ARE online — display them in the bottom sheet friend list with a "Not sharing" label and grayed-out state
- Query all friend profiles regardless of location status, then LEFT JOIN with `user_locations`
- Show friends without location data in the list as "Location off" instead of hiding them entirely
- Remove or soften the "No people found" toast — only show it if user has zero friends at all

#### 2. Fix Note Bubble Visibility + GIF Support
**File: `src/components/chat/NotesRow.tsx`**
- Add `overflow-visible` to the parent container and `z-index` to the bubble so it renders above surrounding elements
- Increase `max-w` from `80px` to `120px` so longer notes don't truncate too aggressively
- Add a GIF preview: if note content starts with `https://` and is a GIF URL, render an `<img>` inside the bubble instead of text
- In the edit dialog, add a "GIF" button that opens a simple GIF search (using Tenor API via an edge function or the free GIPHY endpoint)

**File: `src/hooks/useNotes.ts`**
- Increase max content length from 60 to 200 chars to accommodate GIF URLs
- Add a `gif_url` field concept — store GIF URL in the content field with a prefix like `gif:URL` or just allow URL detection

**Database migration**: Add an optional `gif_url` column to `user_notes` so we can store the GIF separately from text content.

#### 3. VybeSnap Camera Full Redesign
**File: `src/components/camera/VybeSnapCamera.tsx`** — Major rewrite to include:

**Top bar (Snapchat-style)**:
- User avatar (top-left, links to profile)
- Search icon
- Add Friend icon + Flash toggle + Camera flip (top-right)

**Right-side vertical tool strip** (already partially done, expand):
- Flash (with torch)
- Timer (0s, 3s, 10s cycle)
- Grid overlay toggle
- HDR toggle (decorative)
- Night mode toggle (boosts brightness filter)
- Selfie flash (white screen flash for front camera)

**Bottom area**:
- Gallery/Memories thumbnail (bottom-left) — opens device photo picker
- Capture button (center) — tap photo, hold video
- Camera flip shortcut (bottom-right, optional if already in top)
- Horizontal scrollable lens/filter carousel — show circular lens icons (face effects as "Coming Soon", color filters functional)
- Category tabs row: Trending, For You, Favorites, Moments

**Multi-snap support** (already exists via segments — make visible):
- Segment indicator bar at top (already done)
- Add "Send All" vs individual segment management

**Music attachment**:
- Add music note icon that opens the existing `SoundPicker`
- Selected song name shown as a pill

**Post-capture quick send row**:
- After capture → editor, show a row of recent friends to quick-send to (reuse recent message users utility)

### Files to modify
- `src/pages/FriendMap.tsx` — fix empty state, show all friends in bottom sheet
- `src/components/chat/NotesRow.tsx` — fix bubble z-index/overflow, add GIF display, add GIF picker in edit dialog
- `src/hooks/useNotes.ts` — support gif_url field
- `src/components/camera/VybeSnapCamera.tsx` — full Snapchat-style redesign with all features

### Database migration
- Add `gif_url TEXT` column to `user_notes` table
- Update RLS and `get_friends_notes` RPC to include `gif_url`

