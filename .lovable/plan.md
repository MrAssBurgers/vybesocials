

## Fix 6 Issues: HoverCard z-index, VybeMap Desktop, Background Leak, Rename, Create Menu Label

### 1. HoverCard z-index (Profile hover blocked on Home)
The `HoverCardContent` in `hover-card.tsx` uses `z-50` which is too low -- the desktop sidebar and other elements overlap it.

**Fix**: Change `z-50` to `z-[9999]` in `src/components/ui/hover-card.tsx` so the popover always renders above everything.

### 2. VybeMap not showing on Desktop
The map container uses `fixed inset-0 md:absolute md:inset-0`. On desktop inside AppLayout, the `absolute` positioning within the flex layout may cause the Leaflet container to have zero height. The `invalidateSize` calls exist but the initial render timing may miss the layout settle.

**Fix in `src/pages/FriendMap.tsx`**:
- Change the map wrapper from `fixed inset-0 md:absolute md:inset-0` to always use `absolute inset-0` since the parent already provides `h-full` via `noPadding` in AppLayout
- Add additional `invalidateSize` calls with longer delays (1000ms, 2000ms) to catch desktop layout settling
- Ensure the parent wrapper has explicit `h-full w-full` and `position: relative`

### 3. Profile Background Leaking to Home Page
In `src/pages/Profile.tsx`, when viewing another user's profile with an equipped theme, the code sets `document.body`'s background via `setBackgroundImage()`. The cleanup tries to read the previous background from a non-existent `#app-background-layer` DOM element, so `previousBgRef.current` stays `undefined` and the restore fails.

**Fix in `src/pages/Profile.tsx`**:
- Instead of reading from a DOM element, use `useAppBackground().background.imageUrl` to capture the current background URL before overriding
- On cleanup, call `refreshBackground()` instead of `setBackgroundImage(previousBgRef.current)` -- this re-fetches the user's own active background from the database, which is the authoritative source

### 4. Unselect People Who See Your Location
Currently Ghost Mode is all-or-nothing. Add per-friend visibility controls.

**Fix in `src/pages/FriendMap.tsx`**:
- Add a "hidden friends" list stored in localStorage (`vybe-map-hidden-friends`)
- In the Ghost Mode sheet, add a "Manage Visibility" section showing a list of friends with toggle switches
- Filter `friendsArr` to exclude hidden friend IDs before rendering markers
- Hidden friends won't see the user's location either (filter in the upsert query isn't possible client-side, so add a note that this is display-only for now; server-side would need a new table)

*Simplified approach*: Add toggles in Ghost Mode sheet. Hidden friends' markers are hidden from the map view. Label this as "Hide from map" since true server-side blocking would require a new table.

### 5. Rename VibeMap → VybeMap
**Files to update**:
- `src/components/layout/DesktopLeftSidebar.tsx`: Change `label: 'VibeMap'` → `label: 'VybeMap'`
- `src/pages/FriendMap.tsx`: Update any "VibeMap" text references

### 6. Add "VybeMap" Label Under Green Icon in Create Menu
In `src/components/hub/CreateMenuLayer.tsx`, the green MapPin button (line ~244-249) has no text label.

**Fix**: Add a small text label "VybeMap" below the icon button, styled as `text-[9px] font-bold text-emerald-400` positioned below the button using a flex-col wrapper.

### Files Modified
- `src/components/ui/hover-card.tsx` -- z-index bump
- `src/pages/FriendMap.tsx` -- desktop map fix, rename, friend visibility toggles
- `src/pages/Profile.tsx` -- fix background cleanup logic
- `src/components/layout/DesktopLeftSidebar.tsx` -- rename VibeMap → VybeMap
- `src/components/hub/CreateMenuLayer.tsx` -- add VybeMap label

