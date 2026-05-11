## Why the compass is wrong today

`src/pages/FriendMap.tsx` (lines 818–1013) fakes rotation by CSS-transforming Leaflet's `.leaflet-map-pane`:

- Rotates the entire pane with `transform: rotate(...) scale(cover)`
- Counter-rotates every marker via `--map-counter-rot` CSS var
- Disables Leaflet `dragging` while rotated (so panning is broken)
- Re-applies on every `move`/`zoom`, while another effect also pans the map to follow the user — creating a feedback loop and visible "drift" / jitter
- Cover-scale hack to hide blank corners distorts tile positions, so the avatar is no longer pinned exactly to its real GPS pixel
- Counter-rotation is per-marker DOM, so popups, clusters, the accuracy circle and weather tiles drift

Leaflet has no real bearing support — that's the root cause.

## Fix: native bearing rotation (Google-Maps style)

Two viable paths. I recommend Path A; Path B is the fallback if A doesn't behave on iOS.

### Path A (recommended) — Add `leaflet-rotate`

`leaflet-rotate` is a small, maintained plugin that monkey-patches Leaflet to add real `bearing`, `setBearing()`, `rotate: true` map option, and a rotated-pan handler. No tile re-layout, no CSS hacks, markers natively stay upright.

Steps:

1. `bun add leaflet-rotate`
2. In `FriendMap.tsx`, `import 'leaflet-rotate'` after `import L from 'leaflet'`
3. Pass `rotate: true, bearing: 0, touchRotate: true, rotateControl: false` when constructing the map
4. Delete the entire CSS-rotate effect (lines ~964–1013), the marker counter-rotate CSS (~1061), the `dragging.disable()` call, and the two-finger twist effect (~914–953) — `touchRotate: true` handles two-finger twist natively
5. Replace heading-up application with `map.setBearing(-heading, { around: map.latLngToContainerPoint(safeMyCoords) })` inside the orientation handler — rotation pivots exactly around the avatar
6. Keep the existing `deviceorientationabsolute` / `webkitCompassHeading` logic from lines 842–876 — that part is correct
7. Remove the auto-pan follow effect (~955–962); with `setBearing({ around: userPoint })` the avatar stays put without panning

### Path B (fallback) — Migrate to MapLibre GL JS

If `leaflet-rotate` misbehaves on iOS Safari, swap Leaflet for MapLibre (`bun add maplibre-gl`). MapLibre has first-class `bearing`, `easeTo({ bearing, around })`, vector tiles, and avatar markers that stay upright via `rotationAlignment: 'viewport'`. Free OSM raster tiles work without an API key. Bigger refactor (~1 day) but bulletproof.

Google Maps and Apple MapKit JS both require paid keys / Apple Developer JWT setup, so I'm not proposing those unless you specifically want them.

## Test harness — fake orbiting user

To verify rotation pivots perfectly on the user (without walking around outside), add a dev-only fake-user that orbits the real avatar:

1. Add a `?fakeOrbit=1` query param check at the top of `FriendMap.tsx`
2. When set, start an interval that updates a synthetic friend at `safeMyCoords` + `(cos t * 50m, sin t * 50m)`, t advancing every 50ms
3. Render it as a regular friend marker (red dot labelled "TEST")
4. With heading-up ON, the orbiting dot should trace a perfect circle around the stationary avatar at the screen center; if it doesn't, the pivot is still wrong
5. Also add a "Fake heading sweep" toggle that, instead of using the real magnetometer, drives `setHeading` from 0→360 over 8s — lets us verify rotation on a desktop with no compass

This harness stays behind the query param so it never ships to normal users.

## QA checklist (I'll run all of these before saying done)

- Heading-up ON, stand still: avatar dot is pinned to one screen pixel as the world spins
- Two-finger twist (compass OFF): map rotates smoothly, avatar still pinned
- Pan with one finger while rotated: works (currently broken)
- Pinch-zoom while rotated: works, avatar stays pinned
- iOS Safari: `webkitCompassHeading` path triggers, no jitter
- Android Chrome: `deviceorientationabsolute` path triggers, no double-handler jitter
- Desktop (no magnetometer): toast "No compass detected" still fires after 2.5s
- Fake orbit: dot traces a clean circle around stationary avatar
- Markers, accuracy circle, popups, weather chip stay upright
- Toggle heading-up off → map snaps back to north-up cleanly with no leftover transforms

## Files touched

- `package.json` (+1 dep)
- `src/pages/FriendMap.tsx` (rewrite of compass + rotation block, ~200 lines net delete)
- No DB / backend changes

## Risk

`leaflet-rotate` is community-maintained, last release ~2023. It's stable but not part of core Leaflet. If we ever upgrade `leaflet` to 2.x it may need replacement — that's when we'd jump to Path B (MapLibre).
