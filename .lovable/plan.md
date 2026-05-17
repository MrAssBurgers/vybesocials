## Goal
Stop the app from crashing when the camera opens, and never show the browser's white "video poster + play button" placeholder. While the stream loads, show solid black instead.

## Root causes

1. **White screen + play button**
   Every `<video>` surface (`VybeSnapCamera`, `Camera`, `CameraWithSound`, `MobileCreateStudio`) renders inside a parent that is not guaranteed to be `bg-black`, and the `<video>` element itself has no background. While the stream is attaching (or if iOS Safari/Despia blocks autoplay because an audio track is present on the MediaStream), the browser shows its default poster — a white box with a play button.

2. **Crash on open**
   `VybeSnapCamera.startCamera` may call `stopCameraStream()` on a globally cached stream (`getActiveStream()`) that another consumer (call warmup, prior camera mount) still references, then immediately re-invokes `getUserMedia`. On Despia/Android WebView this double acquisition crashes the WebView process (already documented for call warmup in `callMediaWarmup.ts`). The mount effect also runs `startCamera` inside `requestAnimationFrame` after teardown, so a fast remount fires two overlapping `getUserMedia` calls.

## Changes

### 1. Kill the white placeholder everywhere (`src/components/camera/VybeSnapCamera.tsx`, `Camera.tsx`, `CameraWithSound.tsx`, `src/components/create/MobileCreateStudio.tsx`)
- Add `bg-black` to the `<video>` element itself and to its immediate wrapper so the loading state is solid black, never white.
- Add inline `style={{ backgroundColor: '#000' }}` on each `<video>` as a belt-and-braces fix (some WebViews ignore Tailwind on `<video>`).
- Add `disablePictureInPicture` and `controls={false}` explicitly so no browser chrome can leak through.
- Hide the `<video>` until `cameraReady` is true (use `opacity-0` → `opacity-100` transition) in `VybeSnapCamera`; the existing black loader overlay then fully covers the surface instead of fighting the video poster.

### 2. Stabilize camera open in `VybeSnapCamera.tsx`
- Guard against concurrent `startCamera` calls with a `startingRef` mutex — if a start is already in flight, ignore re-entries from the RAF + effect cleanup race.
- Stop calling `stopCameraStream()` (which tears down the shared global stream) when we already have a usable `streamRef.current`. Only stop streams *we* own.
- Acquire camera **video-only first** (`audio: false`) so iOS will reliably autoplay the muted preview; only add an audio track later when the user actually starts recording (`startRecordingSegment` already runs from a tap, which is a valid gesture for `getUserMedia({audio:true})`).
- Wrap the `startCamera` body in a try/catch that always clears `startingRef` and never throws past the boundary.

### 3. Tighten the mount effect
- On `isOpen → false`, also clear `startingRef` and any pending RAF to avoid the unmount → remount overlap.
- On Despia, skip the RAF defer and call `startCamera()` synchronously inside the mount effect so the WebView sees a single gesture-driven path.

### 4. Crash safety
- `CameraMountBoundary` already exists — wrap any camera surface that's currently unwrapped (`Camera.tsx` and `CameraWithSound.tsx`) with it so a thrown render no longer tears down the page; the boundary closes the modal cleanly.

## Out of scope
- No changes to call/FaceTime warmup logic.
- No changes to DMs, login approval, or any other unrelated subsystem.
- No new dependencies.

## Files touched
- `src/components/camera/VybeSnapCamera.tsx`
- `src/components/camera/Camera.tsx`
- `src/components/camera/CameraWithSound.tsx`
- `src/components/create/MobileCreateStudio.tsx`
