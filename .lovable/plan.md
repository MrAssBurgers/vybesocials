## Problem

In `FriendMap.tsx`, when the compass / heading-up mode is enabled, the map's inner Leaflet pane is rotated using `transform-origin: center center`. That spins the map around the **screen center**, not around your own avatar. If you've panned the map at all — or if your avatar isn't perfectly centered — the world appears to rotate around an empty spot while your character drifts off to the side. Google Maps instead keeps your character pinned in place and rotates the world *around* it.

## Fix

Two complementary changes in `src/pages/FriendMap.tsx`:

### 1. Auto-follow your location while compass is on

When `headingUp` becomes true (and on every subsequent location/heading update), recenter the map onto `safeMyCoords` so your avatar always sits at the rotation pivot.

- On enabling heading-up: `map.flyTo(safeMyCoords, MY_LOCATION_ZOOM, { duration: 0.6 })`.
- While heading-up is on, every time `safeMyCoords` changes, do a quiet `map.panTo(safeMyCoords, { animate: true, duration: 0.4, noMoveStart: true })` so the dot stays glued to center.
- Keep `map.dragging.disable()` already in place. Also disable two-finger twist and the existing `recenter` button override during heading-up (no behavior change needed beyond what's there).

### 2. Pivot the CSS rotation around the avatar, not the pane center

Even with auto-follow, briefly during animations the avatar can be a few pixels off center. Make the rotation rock-solid by computing the avatar's pixel position inside the map container and writing it into `transform-origin`.

In the existing rotation effect (around lines 955-970):

```ts
const root = mapEl.current;
const map = mapRef.current;
const pane = root?.querySelector('.leaflet-map-pane') as HTMLElement | null;
if (!root || !map || !pane) return;

const rot = headingUp ? -heading : manualRotation;

// Pivot around the user's avatar when we have a fix; otherwise fall back to center.
let originX = root.clientWidth / 2;
let originY = root.clientHeight / 2;
if (safeMyCoords) {
  const pt = map.latLngToContainerPoint(safeMyCoords as any);
  originX = pt.x;
  originY = pt.y;
}

const rad = (rot * Math.PI) / 180;
const cover = Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad));
pane.style.transformOrigin = `${originX}px ${originY}px`;
pane.style.transform = rot ? `rotate(${rot}deg) scale(${cover})` : '';
pane.style.transition = 'transform 120ms linear';
pane.style.willChange = rot ? 'transform' : '';
root.style.setProperty('--map-counter-rot', `${-rot}deg`);
```

Add `safeMyCoords` to the effect's dependency array so the origin re-evaluates when you move.

Also re-run this effect when the user pans/zooms (subscribe once to Leaflet's `move` and `zoom` events while `headingUp` is true and re-apply the transform), so the pivot stays locked on the avatar even if a gesture briefly nudges the view.

### 3. Keep cover-scale honest with off-center pivot

Because the rotation pivot is no longer the geometric center, the existing `cover = |cos|+|sin|` scale can still leave a corner empty when the avatar is near an edge. Bump the scale up by the worst-case offset:

```ts
const dx = Math.max(originX, root.clientWidth - originX);
const dy = Math.max(originY, root.clientHeight - originY);
const halfDiag = Math.hypot(dx, dy);
const halfMin = Math.min(root.clientWidth, root.clientHeight) / 2;
const cover = rot ? Math.max(1, halfDiag / halfMin) : 1;
```

This guarantees no blank edges regardless of where the avatar sits.

## Files touched

- `src/pages/FriendMap.tsx` — update the heading-up effect to follow the user, update the rotation effect to pivot around the avatar with corrected cover-scale.

No other components, hooks, styles, or business logic change. No DB or backend changes.

## Verification

- Open `/map`, toggle the compass / heading-up button.
- Your avatar should stay pinned at screen center while the world rotates underneath as you turn the phone.
- Pan the map, toggle heading-up: the map snaps back to center on the avatar before rotating.
- No blank corners visible at any rotation angle.