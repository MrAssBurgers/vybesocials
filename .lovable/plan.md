

## Plan: Background Location + Enhanced Map + Background Brief Pre-fetch

### 1. Background Location Tracking (Global Provider)

Currently, `watchPosition` only runs when the `FriendMap` component is mounted. Move location tracking to a global provider that runs app-wide.

**Files:**
- **New: `src/hooks/useBackgroundLocation.ts`** — Global hook that runs `watchPosition` whenever sharing is enabled, regardless of which page the user is on. Upserts to `user_locations` every 15s. Stores last coords in a ref so the map can read them without re-initializing.
- **New: `src/providers/LocationProvider.tsx`** — Wraps the app, initializes `useBackgroundLocation` for authenticated users with sharing enabled.
- **Edit: `src/App.tsx`** — Wrap app tree with `<LocationProvider>`.
- **Edit: `src/pages/FriendMap.tsx`** — Remove the inline `watchPosition` useEffect and `upsertLocation` logic; consume coords from the global provider instead.

**Note:** True background tracking when the PWA is closed is not possible with web APIs alone (no iOS support, limited Android). The service worker can't access `geolocation`. This will keep tracking as long as the app tab is open/foregrounded, which is the best web can do.

### 2. Enhanced Friend Profile Card on Map Tap

The bottom card already shows pfp, name, status, distance, and a Google Maps directions button. Enhance it:

**Edit: `src/pages/FriendMap.tsx`**
- Show movement status more prominently: detect from `sel.status` whether they're driving (`🚗`), walking, or stationary — display as a colored badge (e.g., "Driving • 45 mph" or "Walking" or "Stationary").
- Add speed tracking: store `speed` in the `user_locations` upsert, read it back on friend records. Show estimated activity based on speed thresholds.
- Make the profile avatar tappable to navigate to their profile (`/u/{username}`).
- Redesign the card with a Life360-inspired look: larger avatar, activity indicator ring, battery-style freshness indicator.

**Migration:** Add `speed` column to `user_locations` table (nullable float).

### 3. Smooth Marker Movement (Apple Maps-style)

**Edit: `src/pages/FriendMap.tsx`**
- Store previous marker positions in a ref map (`Map<userId, L.Marker>`).
- Instead of clearing and re-creating all markers on every update, update existing markers with animated `setLatLng` using Leaflet's built-in `L.Marker` animation or a manual `requestAnimationFrame` interpolation loop.
- For the user's own marker (`myMk`), animate position changes smoothly instead of jumping.

### 4. Life360 + Insta + Vybe Theme Map Styling

**Edit: `src/pages/FriendMap.tsx`** (CSS section)
- Larger friend avatars with gradient activity rings (green = moving, gray = stationary).
- Add a subtle glow/pulse to friends who are currently moving.
- "Last seen" tooltip below avatar with relative time.
- Friend strip at bottom: Instagram Stories-style rings (green gradient for active, gray for inactive).
- Selected card: glassmorphic dark card with rounded corners, activity icon, speed, and a prominent "Navigate" button.

### 5. Daily Brief Background Pre-fetch

**Edit: `src/components/home/AIBriefSheet.tsx`**
- Export `fetchBrief` logic into a standalone utility or hook that can be called outside the sheet.

**New: `src/hooks/useBriefPreFetch.ts`**
- On app mount (authenticated), check if cached brief is stale (>30 min). If so, fetch in the background silently and update the cache.
- Re-fetch every 30 minutes while the app is open using `setInterval`.
- When user opens the brief sheet, it instantly shows the pre-fetched data (no loading spinner).

**Edit: `src/components/home/AIBriefSheet.tsx`**
- On open, read from cache first. If cache is fresh (<30 min), show immediately with no loading state. Add a manual "Refresh" button that the user can tap to force a new fetch.
- Remove the `hasFetchedRef` gate — the pre-fetcher handles freshness.

**Edit: `src/App.tsx`** (or a top-level component)
- Initialize `useBriefPreFetch()` for authenticated users.

### Files Summary

| # | File | Action |
|---|------|--------|
| 1 | `src/hooks/useBackgroundLocation.ts` | Create — global location tracking hook |
| 2 | `src/providers/LocationProvider.tsx` | Create — wrap app with location provider |
| 3 | `src/App.tsx` | Edit — add LocationProvider + useBriefPreFetch |
| 4 | `src/pages/FriendMap.tsx` | Edit — consume global location, smooth markers, Life360 UI |
| 5 | `src/hooks/useBriefPreFetch.ts` | Create — background brief fetcher |
| 6 | `src/components/home/AIBriefSheet.tsx` | Edit — instant cache display, manual refresh |
| 7 | Migration SQL | Add `speed` column to `user_locations` |

