

## Plan: Fix Remaining Infinite Re-render Loop & Polish

### Critical Bug — useSwingDetection infinite loop (STILL ACTIVE)

The previous fix converted `lastSwingTime` to a ref but missed the real cycle:

```text
startListening depends on isListening (line 89)
  → startListening calls setIsListening(true)
  → isListening changes → startListening recreates
  → effect (line 97-108) has startListening in deps → effect re-fires
  → stopListening called → setIsListening(false) → cycle repeats
```

**Fix**: Remove `isListening` from `startListening`'s deps by using an `isListeningRef` alongside the state. Use the ref for the guard check inside `startListening`/`stopListening`, and keep `setIsListening` only for external consumers. Remove `startListening`/`stopListening` from the effect's dependency array by using refs for those too, or restructure the effect to not depend on them.

Concrete approach — replace the effect + callback pattern with a single stable effect:

```typescript
const isListeningRef = useRef(false);
const handleMotionRef = useRef(handleMotion);
handleMotionRef.current = handleMotion;

useEffect(() => {
  const shouldListen = enabled && (!requiresUserGesture || permissionGranted === true);
  
  if (shouldListen && !isListeningRef.current) {
    const listener = (e: DeviceMotionEvent) => handleMotionRef.current(e);
    window.addEventListener('devicemotion', listener);
    isListeningRef.current = true;
    setIsListening(true);
    return () => {
      window.removeEventListener('devicemotion', listener);
      isListeningRef.current = false;
      setIsListening(false);
    };
  } else if (!shouldListen && isListeningRef.current) {
    // Cleanup handled by previous effect's return
  }
}, [enabled, permissionGranted, requiresUserGesture]);
```

This eliminates the dependency cycle entirely — the effect only depends on stable primitives/booleans.

### File Changes

| File | Change |
|------|--------|
| `src/hooks/useSwingDetection.ts` | Restructure to use refs for listener management, eliminating the startListening→isListening→effect dependency cycle |

### No database changes needed.

