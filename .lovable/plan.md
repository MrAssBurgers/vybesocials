# Fix: DM Vybe Snap camera crashes the app

## Root causes (most likely)

Looking at `ChatView.tsx` and `VybeSnapCamera.tsx`, the camera button in DMs has several fragile spots that can hard-crash the WebView (Despia/Android) or the React tree:

1. **Unhandled promise from `requestCameraStream`** — In `ChatView.tsx` (lines 1788, 1845) the camera button fires `requestCameraStream({...})` without `await` or `.catch()`. On Despia, a denied/failed permission throws an unhandled rejection that the wrapper treats as a fatal JS crash.
2. **No outer error boundary around `VybeSnapCamera`** — The existing `CameraErrorBoundary` lives **inside** `VybeSnapCamera.tsx`, so if the component throws during its **own** initial render (heavy state init, Sheet portal, framer-motion mount), the boundary never catches it and the entire `ChatView` unmounts.
3. **Effect with no deps reattaches `srcObject` every render** (`VybeSnapCamera.tsx` lines 257–262). On some Android WebViews, reassigning `srcObject` mid-play triggers a `NotReadableError` that bubbles through React.
4. **Active call collision** — Per project memory, `stopCameraStream()` must be called before mode switches. If a lingering call still owns the camera track, opening Snap fails hard. The current open path doesn't check `useCallStore` state.
5. **Despia permission race** — On native wrapper, `getUserMedia` must be invoked from a direct user gesture. The current path: tap → `requestCameraStream` (async, no await) → `setShowSnapCamera(true)` → mount → `requestAnimationFrame` → `startCamera` → `getUserMedia`. Multiple async hops break the gesture chain.

## Changes

### 1. `src/components/chat/ChatView.tsx`
- Replace the two inline `onOpenSnapCamera` handlers (lines 1788, 1845) with a single memoized `handleOpenSnapCamera` that:
  - Bails if `useCallStore().state.phase !== 'idle'` and shows a toast ("End your call to use the camera").
  - Calls `stopCameraStream()` defensively first.
  - Calls `requestCameraStream(...)` wrapped in `.catch(() => {})` so a rejection never bubbles.
  - Then `setShowSnapCamera(true)`.
- Wrap the `<VybeSnapCamera>` JSX in a small local `<CameraMountBoundary>` (class ErrorBoundary) that closes the modal and toasts on render error instead of unmounting `ChatView`.

### 2. `src/components/camera/VybeSnapCamera.tsx`
- Fix the dep-less `useEffect` at lines 257–262: add `[cameraReady]` deps so it only attaches `srcObject` once when the stream becomes ready, not on every render.
- In `startCamera`, when `getActiveStream()` exists but doesn't match constraints, also wrap the fallback `getUserMedia` in a try/catch that sets `permissionDenied` instead of throwing.
- Guard `MediaRecorder.isTypeSupported` access (some WebViews don't define `MediaRecorder` at all) — return early with a friendly message instead of crashing on photos-only devices.
- Move the `CameraErrorBoundary` to also wrap the editor phase (currently only render of camera surface is guarded).

### 3. `src/components/chat/CameraFirstOverlay.tsx`
- Same `requestCameraStream(...).catch(() => {})` hardening if/when this overlay is reactivated.
- Wrap its `<VybeSnapCamera>` in the same boundary.

### 4. `src/hooks/useCameraPreload.ts`
- Already returns `null` on failure but reject paths inside `requestCameraStream` use `console.warn` only — keep, but ensure no callsite leaves the returned Promise unhandled (handled in step 1).

## Files touched

- `src/components/chat/ChatView.tsx` — handler + boundary wrap
- `src/components/camera/VybeSnapCamera.tsx` — effect deps, MediaRecorder guard, broader boundary
- `src/components/chat/CameraFirstOverlay.tsx` — same hardening
- (new) `src/components/camera/CameraMountBoundary.tsx` — reusable outer error boundary

## Out of scope

- No backend / DB changes.
- No visual redesign of the camera UI.
- Existing VYBE Score / Challenges work from this thread is untouched.
