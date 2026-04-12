

## Fix Camera Speed, Toybox Photos on iOS, and Revamp VybeMap to Match Snap Maps

### 1. Instant Camera Connection (`src/components/camera/VybeSnapCamera.tsx`)

**Problem**: `startCamera` always stops any preloaded stream and requests a brand new one, causing a visible delay.

**Fix**: Reuse the preloaded stream when facing mode and audio settings match, only requesting a new stream when switching cameras. Remove the `stopCameraStream()` call at line 82 and instead check if the existing stream's track settings match. Also remove the `setCameraReady(false)` on open (line 160) so the UI doesn't flash a loading state unnecessarily.

### 2. Toybox Photo Picker Broken on iPhone (`src/components/chat/Toybox.tsx`)

**Problem**: On iOS Safari, programmatic `.click()` on a hidden `<input type="file">` inside a Drawer can be blocked because the gesture context is lost when the drawer animation completes. The file inputs are rendered inside the Drawer content, but the click is triggered via a button's `onClick` which may lose the user-gesture chain on iOS.

**Fix**: 
- Move the hidden `<input type="file">` elements **outside** the Drawer/Popover wrapper so they exist in the main DOM at all times
- Ensure the `onClick` handler calls `imageInputRef.current?.click()` synchronously (no async, no setTimeout)
- Add `capture` attribute option for iOS camera access: `accept="image/*"` without `capture` allows photo library

### 3. Revamp VybeMap to Match Snap Maps (`src/pages/FriendMap.tsx`)

Looking at the reference screenshots, the Snap Maps UI has these key elements our map is missing:

**Top area (matching screenshot 3)**:
- User's own avatar (top-left) with a star/streak badge
- Location name + weather info (top-right): "Argyle, 72°F" with weather icon
- Filter chip row: Memories, Trending, Visited, Popular

**Search panel (matching screenshot 1)**:
- Bottom sheet / pull-up panel with "Search for places" input
- Filter chips: Trending, Memories, Visited, Popular
- "Friends" section listing friends with their current location labels and time ago
- Each friend row shows: avatar, display name, location text (e.g. "Driving in Trophy Club"), time ago
- "View More" link at bottom

**Location Settings (matching screenshot 2)**:
- Ghost Mode toggle with avatar
- "Who Can See My Location" section with radio options: My Friends, My Friends Except..., Only These Friends...
- Already partially implemented in our Ghost Mode sheet — needs expansion

**Changes to implement**:

a. **Add weather + location header**: Fetch weather from a free API (or use browser geolocation reverse geocode) to show city name and temperature at top-right, with user's avatar at top-left

b. **Add filter chip row**: Below the top bar, add horizontal scrollable chips for Memories, Trending, Visited, Popular (decorative for now, can be wired up later)

c. **Revamp search into a pull-up bottom sheet**: Replace the current top overlay search with a Snap-style bottom sheet that shows:
   - Search input at top
   - Filter chips
   - "Friends" section with list of all friends showing their current location label and time since update
   - Tapping a friend in the list flies to them on the map

d. **Expand Ghost Mode sheet**: Add "Who Can See My Location" section with the three radio options (My Friends / My Friends Except... / Only These Friends...) matching the Snapchat settings UI

e. **Default map style to dark**: Snap Maps uses a dark style by default — change the default from 'satellite' to 'dark'

f. **Friend marker style**: Already has avatar markers with rings — keep but ensure the label shows the friend's first name below (already does)

g. **Bottom friend avatar strip**: Already exists — keep as-is, matches Snap's bottom row

### Files to modify
- `src/components/camera/VybeSnapCamera.tsx` — reuse preloaded stream for instant camera
- `src/components/chat/Toybox.tsx` — move file inputs outside Drawer for iOS compatibility
- `src/pages/FriendMap.tsx` — major revamp: weather header, filter chips, bottom sheet search with friend list, expanded ghost mode settings, dark default style

