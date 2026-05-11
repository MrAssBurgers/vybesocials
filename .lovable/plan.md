# Polish Pass: Thumbnails, Profile BG, Mobile Actions, Comments, Compass Map

Five independent fixes. Each is scoped to UI/presentation only.

## 1. Kill the white "play button" placeholder everywhere

**Problem:** Profile clips/videos render a white box with a giant play icon while the video loads (visible in screenshot 1). Same fallback also appears in some grid spots.

**Fix:**
- `src/components/posts/ClipsGrid.tsx` (`ClipThumbnail`): replace the bare `<video>` element with the existing `<VideoThumbnail videoUrl={clip.media_url} thumbnailUrl={clip.thumbnail_url}>` component, which generates a poster frame from the video and shows a soft muted gradient skeleton (never a white box) while loading.
- Pass `thumbnail_url` through the clip query (check `useProfile` / wherever clips are fetched for the profile tab — add `thumbnail_url` to the select if missing).
- `src/components/ui/VideoThumbnail.tsx`: tighten the loading state — remove the fallback `<Play>` icon entirely (the `hasError` branch). Replace with a subtle gradient placeholder so a missing thumbnail just looks like a dark card, never a play button.
- Audit other call sites: `rg "Play.*h-(8|12|16)" src/components` and any place that renders `<Play>` as a fallback over media — swap for the gradient skeleton.
- Cache generated poster frames in memory (Map keyed by media_url) so re-mounting the grid is instant.

## 2. Custom profile background should only show on that user's profile

**Problem:** When a user sets a custom background, it follows them across pages (home, etc.) and other users' profiles also bleed it.

**Fix:**
- Find where the active background is applied to the DOM (likely `useApplyAutoTheme`, `useUserBackgrounds`, or a `<body>`/AppLayout effect that sets `body.style.backgroundImage`).
- Move that DOM-write effect out of the global layout. Apply it ONLY inside the profile page component, scoped to a `<div>` wrapper for that profile, and ONLY when `profile.id === routeProfileId` (own profile) OR when viewing that specific user's profile (use the viewed profile's background, not the logged-in user's).
- On unmount of the profile page, clear the background.
- Remove any `body.style.backgroundImage` writes from global hooks.

## 3. Mobile profile action buttons — match desktop

**Problem:** On mobile (screenshot 2), Message/Share/More live in a vertical scrolling stack on the right; ugly. Desktop shows them inline.

**Fix:**
- Locate the profile header component (likely `src/components/profile/ProfileHeader.tsx` or similar inside `src/pages/Profile`).
- Remove the mobile-only vertical stack / overflow-scroll wrapper.
- Use the same flex row layout as desktop: Follow/Message as full-width primary buttons under the stats row, with Share + More as 40px icon buttons inline. No horizontal or vertical scroll. Use `gap-2` and `flex-1` for the primary actions.

## 4. Redesign comments sheet — premium feel

**Problem:** Comments sheet (screenshot 3) is plain dark with a bordered comment "card" that looks dated.

**Fix:**
- File: `src/components/comments/*` (likely `CommentsSheet.tsx` / `CommentItem.tsx`).
- New look:
  - Remove the boxed border around each comment. Use flat row layout: avatar (36px) · column (username + small verified mark · text · meta row).
  - Username: 13px semibold; comment body: 14px regular w/ `text-foreground/90`; meta (time · Reply · ❤️ count) in a single 11px row using `text-muted-foreground`.
  - Like heart on the right, vertically centered, with count under it (Instagram-style).
  - Replies indented 44px with a hairline left rule (`border-l border-border/40 pl-3`).
  - Sheet header: drop the "1" count to a subtle badge next to "Comments", thinner divider, larger drag handle.
  - Composer: pill input with inline emoji + send (purple→cyan gradient send button stays). "AI Suggest" becomes a small ghost chip above the input only when input is empty.
  - Smooth `motion.div` stagger on initial mount.

## 5. VYBE Map compass — pivot, gestures, default zoom

**Problem statement (from user):**
- Compass laggy / imprecise.
- Dragging while compass-on rotates around a wrong point.
- Want: in compass mode, only pinch-to-zoom is allowed; one-finger drag disables compass and restores the pre-compass map state; re-enabling compass snaps back to user-centered rotation; default zoom slightly further back.

**Current state:** `FriendMap.tsx` uses `leaflet-rotate` with `setBearing(-heading)` (added last turn).

**Fix:**

a) **Lag / precision:**
- The `deviceorientationabsolute` handler currently calls `setBearing` on every event (~60Hz on iOS). Throttle via `requestAnimationFrame` and only commit if the delta > 0.5°. Smooth with a small low-pass filter: `displayed = displayed + 0.25 * shortestAngleDelta(displayed, target)`.
- Always pass `{ animate: false }` to `setBearing` to avoid leaflet-rotate's default tween fighting the next frame.

b) **Pivot:**
- After every compass update, re-pan so the user marker is at the screen center: `map.panTo(myCoords, { animate: false })` BEFORE `setBearing`. leaflet-rotate rotates around the map center, so centering the user guarantees rotation around them.
- Remove the per-frame `latLngToContainerPoint` pivot trick — it's unnecessary once the user is the center.

c) **Gesture rules in compass mode:**
- When `headingUp` is enabled:
  - Snapshot pre-compass state: `{ center, zoom, bearing: 0 }`.
  - Disable Leaflet drag: `map.dragging.disable()` (keep `touchZoom`, `scrollWheelZoom`, `doubleClickZoom` enabled for pinch).
  - Add a `touchstart`/`pointerdown` listener: if exactly 1 pointer moves more than ~8px, treat as drag → call `disableCompass()` which: re-enables `map.dragging`, animates `setBearing(0)`, animates `flyTo(snapshot.center, snapshot.zoom)`, sets `headingUp=false`.
  - Re-enabling compass: snapshot current state again, animate `flyTo(myCoords, defaultCompassZoom)`, then start heading updates.

d) **Default zoom further back:**
- Add `const DEFAULT_COMPASS_ZOOM = 16` (current is likely 18). Use this when entering compass mode.

e) **Cleanup:**
- Remove the `?fakeOrbit=1` test code now that pivot is correct (or keep behind a more hidden flag). Remove the fake heading sweep too.

## Files touched

- `src/components/posts/ClipsGrid.tsx`
- `src/components/ui/VideoThumbnail.tsx`
- Profile clips data hook (add `thumbnail_url` to select)
- Background-applying hook (likely `src/hooks/useUserBackgrounds.ts` or `useApplyAutoTheme.ts`) + Profile page wrapper
- Profile header component (mobile actions layout)
- `src/components/comments/CommentsSheet.tsx` + `CommentItem.tsx`
- `src/pages/FriendMap.tsx` (compass throttle, pivot, gesture rules, default zoom)

## Out of scope

- The 503 errors on `/calls` and `Failed to fetch` on Nominatim in the network log are transient backend/CDN issues, not code bugs — not addressed here.
- The `/notifications` 403s belong to a separate RLS task.
