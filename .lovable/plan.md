

## Plan: Snap Map Feature Parity for VybeMap

### Bug Fix (immediate)
The map crashes with `friends.find is not a function` because `friends` can be `undefined` from the query. Fix by adding defensive array checks on lines 174 and 177-183.

### Snap Map Features to Add

**1. Ghost Mode UI** — Already have sharing toggle, but redesign it as a proper Snap-style "Ghost Mode" bottom sheet with three options: Ghost Mode (off), My Friends, Select Friends. For now, keep it as on/off but style it like Snap's ghost mode pill.

**2. Marker Clustering** — When friends are near each other at low zoom, group them into a cluster bubble showing count + stacked avatars. Use Leaflet's built-in zoom events to toggle between clustered and individual views.

**3. Actionmoji / Status Indicators** — Show activity status on markers (🎵 listening to music, ✈️ traveling, 🏠 home, etc.). Add a `status` field to the location upsert that auto-detects based on speed/time-of-day, or let users manually set it.

**4. Heat Map Layer** — Add a toggleable heat map overlay showing where friends have been recently (aggregate location history). This requires a new `location_history` concept — skip for now, but add a visual toggle placeholder.

**5. Weather Overlay** — Show current weather icon on the map at the user's location using a free weather API or simple time-based logic (day/night indicator).

**6. Place Search** — Add a search bar that uses the Leaflet/OpenStreetMap Nominatim geocoder to search for places and fly to them.

**7. Map Styles Toggle** — Add a layers button to switch between satellite, dark, and terrain map styles (like Snap's map style options).

**8. Stories on Map** — When friends have recent posts, show a colorful ring around their marker (like Snap shows stories on map). Tap to view.

**9. Improved Animations** — Smooth marker position transitions using `setLatLng` with requestAnimationFrame interpolation instead of instant jumps.

**10. Full-Screen Friend Card** — When tapping a friend, slide up a larger card with: avatar, name, last active time, distance, weather at their location, and action buttons (message, directions, profile).

### Database Changes
- Add migration: `ALTER TABLE user_locations ADD COLUMN IF NOT EXISTS status text DEFAULT NULL;`
- This stores optional activity status per user.

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/FriendMap.tsx` | Fix crash bug, add clustering, search, map styles, enhanced cards, ghost mode UI, status indicators |
| New migration | Add `status` column to `user_locations` |

### Technical Notes
- Fix the `friends.find` crash by ensuring `Array.isArray(friends)` guards
- Use Nominatim (free, no API key) for place search
- Map style switching via swapping `L.tileLayer` source URLs
- Marker clustering done manually via zoom-level checks (no extra dependency)
- Status auto-detection: speed > 25mph = traveling, stationary + night = sleeping, etc.

