## Fix five issues across signup, theming, snap, and friend-link

### 1. AI Theme Generator says "failed to load" (also breaks "Design Your VYBE")

**Root cause:** `supabase/functions/generate-advanced-theme/index.ts` calls `validateAuth(req)` and `rateLimitOrNull(...)` but never imports them — every request crashes with `ReferenceError`, returning 500 to the client. Both the AI theme generator and the "Design Your VYBE" forge call this function, so the build animation runs forever and finally toasts an error.

**Fix:** Add the missing imports and redeploy.
```ts
import { validateAuth } from "../_shared/auth.ts";
import { rateLimitOrNull } from "../_shared/rateLimit.ts";
```

### 2. Username "premade" value reverts when cleared during onboarding

**Root cause:** In `src/components/onboarding/ProfileSetup.tsx` the **display name** input is bound as `value={data.displayName || username}`. Clearing the field falls through the `||` and snaps back to the username. The auto-fill effect in `src/pages/Onboarding.tsx` (lines 73–78) re-pushes `username` into `displayName` on every render, reinforcing the revert.

**Fix:**
- `ProfileSetup.tsx`: change input to `value={data.displayName ?? ''}`, keep `placeholder={username || 'Your display name'}` so the suggestion still shows.
- `Onboarding.tsx`: remove the always-on `displayName ← username` effect; only seed displayName once on first mount when it's empty.

### 3. App crashes when opening VYBE Snap inside a DM

There's no captured runtime error, and `VybeSnapCamera` does many heavy things at once (camera stream + MediaRecorder + MediaPipe face tracking via `useFaceTracking` + Snap AR provider). Most likely culprits, in order:

1. **AR face tracking always on**: `useFaceTracking({ enabled: isOpen && cameraReady })` loads MediaPipe models the moment Snap opens, even when no AR filter is selected — heavy enough to OOM mobile WebViews.
2. **Always-mounted modal**: `ChatView` always renders `<VybeSnapCamera />` with `isOpen` prop, so its effects can race with `CameraFirstOverlay`.
3. **Stream not stopped before re-open**.

**Plan:** apply two safe mitigations that match the project's existing camera/perf rules:
- `VybeSnapCamera.tsx`: gate face-tracking to `isOpen && cameraReady && !!activeARFilter` (only load MediaPipe when an AR filter is actually picked).
- `ChatView.tsx`: only render `<VybeSnapCamera />` when `showSnapCamera` is true (same pattern used for other modals).
- Also confirm `stopCameraStream()` is called on close.

If a crash persists after this, add console diagnostics around the AR/Snap init path.

### 4. QR scanner stuck on "Camera warming up…"

**Root cause:** In `src/components/friends/AutoFriendDrop.tsx`, when the user switches to the QR tab, `startCamera` is called via `setTimeout(..., 120)`. That severs the user-gesture chain, so iOS Safari often refuses `getUserMedia`, the catch only does `console.warn`, and `cameraReady` never flips → the overlay stays "Camera warming up…" forever. There's also no permission-denied state surfaced to the user.

**Fix:**
- Call `startCamera` synchronously on the QR tab click handler (within the user gesture), not from a `setTimeout` inside an effect.
- Surface camera errors: on failure show a "Camera blocked — enable camera access" toast + visible CTA in the scanner box, instead of silently warming up forever.
- Reduce the perceived warm-up: fall back to `getPreloadedStream()` first (already there), and remove the artificial 120 ms delay.

### 5. NFC scan does nothing (web)

**Root cause:** `useNativeFriendDrop` only activates when `isNativeFriendDropAvailable()` returns true (Capacitor native). On web, the Tap tab silently does nothing because there's no Web NFC fallback. Even on supported Chrome Android, `NDEFReader` requires a user gesture and HTTPS — currently no Web NFC path is wired.

**Fix:**
- Add a Web NFC fallback in `useNativeFriendDrop` (or a sibling hook) using `window.NDEFReader` when available (Chrome Android). Trigger `reader.scan()` from the Tap tab's onClick (gesture-bound), parse the NDEF record's URL the same way QR does, and route to `handleDropScan` / `handleFoundUser`.
- When neither native NFC nor Web NFC is available, show a clear message ("NFC not supported on this device — use the QR tab") instead of an inert UI.

### Files to change

- `supabase/functions/generate-advanced-theme/index.ts` — add two missing imports, redeploy.
- `src/components/onboarding/ProfileSetup.tsx` — fix display-name fallback.
- `src/pages/Onboarding.tsx` — remove always-on auto-fill.
- `src/components/chat/ChatView.tsx` — conditionally mount `VybeSnapCamera`.
- `src/components/camera/VybeSnapCamera.tsx` — gate face-tracking on selected AR filter.
- `src/components/friends/AutoFriendDrop.tsx` — gesture-synchronous camera start, surface errors, add Web NFC scan.
- `src/hooks/useNativeFriendDrop.ts` (or new `useWebNFC.ts`) — Web NFC fallback.

No DB/schema changes. No design-token changes.
