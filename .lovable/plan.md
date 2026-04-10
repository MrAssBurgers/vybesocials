

## Fix: VybeSnapCamera Permission Error

All 11 other items from the plan are already implemented. The one remaining issue:

**VybeSnapCamera calls `getUserMedia` from a `useEffect` (line 106-111)**, which browsers block because it's not triggered by a direct user gesture.

### Current code (broken)
```typescript
useEffect(() => {
  if (isOpen && phase === 'camera') {
    startCamera(); // ← getUserMedia called without gesture
  }
  return () => stopCamera();
}, [isOpen, phase, startCamera, stopCamera]);
```

### Fix
The component is opened by a user tap (e.g., a camera button). The `isOpen` prop changing to `true` happens synchronously from that tap. On most mobile browsers, `getUserMedia` within a `useEffect` triggered by a state change from a click **is** considered gesture-derived — but Safari/WebKit is stricter.

The fix: instead of auto-starting via `useEffect`, show a brief "Tap to start camera" overlay when the component opens. When the user taps it, `startCamera()` runs directly from the click handler, satisfying the gesture requirement.

### File to change
- `src/components/camera/VybeSnapCamera.tsx` — Replace the auto-start `useEffect` with a "Tap to activate camera" overlay that calls `startCamera()` on click. Once the camera is active, hide the overlay and show the live feed as normal.

### Also
- The `update_sound_usage` function is missing `search_path` (linter warning) — add `SET search_path = public` via a small migration for security hardening.

