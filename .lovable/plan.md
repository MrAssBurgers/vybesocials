

## Keep Persistent Mode Calls Alive Indefinitely

### What changes

In persistent (premium "Stay On Call") mode, when the other user leaves a 1:1 call, instead of auto-ending after 30 seconds, the call stays alive **indefinitely** until you manually hang up. The banner will say "{name} left · They can rejoin anytime" with no countdown.

P2P mode keeps its existing 30-second auto-end behavior unchanged.

### Plan

**Single file: `src/components/call/GlobalCallOverlay.tsx`**

**Change the persistent-mode `ParticipantDisconnected` handler (lines 357-371):**
- Check if the current mode is `persistent` AND it's a 1:1 call (not group)
- If so: set `remoteUserLeft = true` but do NOT start any countdown timer or auto-end timeout
- Group calls in persistent mode keep the existing 1-hour linger timer
- P2P mode keeps its existing 30-second timer (lines 147-169, unchanged)

**Update the linger banner text (line 1125):**
- When in persistent mode 1:1: show "Call still live" with "{name} left · They can rejoin anytime" (no countdown)
- Otherwise show the existing countdown text

### Technical details

```
// Line ~357-371: persistent ParticipantDisconnected handler
const isGroupCall = stateRef.current.call?.isGroupCall;
const isPersistent = currentModeRef.current === 'persistent';

if (isPersistent && !isGroupCall) {
  // 1:1 persistent: stay alive forever, no timer
  setRemoteUserLeft(true);
  setAutoEndCountdown(-1); // sentinel for "no countdown"
} else {
  // Group persistent (1hr) or P2P (30s) — existing logic
  const LINGER_SECONDS = isGroupCall ? 3600 : 30;
  // ... existing timer code
}

// Line ~1125: banner text
autoEndCountdown === -1
  ? `${displayName} left · They can rejoin anytime`
  : `${displayName} left · Auto-ends in ${formatTime(autoEndCountdown)}`
```

