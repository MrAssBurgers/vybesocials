## 1. Fix FaceTime/audio call crash on Play Store (Despia) build

**Root cause analysis**

The crash on the native Despia build is caused by a chain of issues that line up specifically on Android WebViews:

1. `callStore.startCall` calls `warmCallMedia()` (in `src/lib/callMediaWarmup.ts`) which fires `navigator.mediaDevices.getUserMedia({ audio, video })` *before* the WebRTC `P2PConnection.connect()` runs its own `getUserMedia`. On a Despia WebView the second `getUserMedia` while the first stream is still alive can hard-crash the WebView (this matches the "app instantly crashes, must clear cache" symptom — the WebView process dies and the cached service worker shell loads stale state).
2. Despia/Android also requires the OS-level mic/camera permission to be granted *before* `getUserMedia` runs. The current code skips the permission probe entirely (see CallButtons comment "Do NOT pre-probe permissions here"). On a fresh install with no granted permissions, the prompt appears mid-getUserMedia and the WebView aborts.
3. A failure inside `startCall` after the DB row is inserted leaves the call store stuck in `creating`/`requesting-media`, and the user sees a frozen overlay until they clear cache.

**Fixes**

- `src/lib/callMediaWarmup.ts` — short-circuit `warmCallMedia` and return `null` immediately when running inside Despia / Capacitor / native Android WebView (UA test: `/despia|vybeapp|wv\)|; wv/i`). This eliminates the duplicate getUserMedia race entirely on native; browser users keep the warmup speed boost.
- `src/lib/callStore.tsx` (`startCall`) — wrap the whole body in a `try/catch/finally` that, on any error, resets state back to `idle`, stops ringback, and surfaces a toast instead of leaving the overlay stuck. Also `await stopCameraStream()` synchronously and `await new Promise(r => requestAnimationFrame(r))` before kicking the warmup so the previous camera handle is fully released.
- `src/components/call/CallButtons.tsx` — on native (Despia) only, request mic/camera permission via the existing Despia bridge (`window.despia?.requestPermission?.('microphone'|'camera')`) inside the gesture before calling `startCall`. Skip on web.
- `src/lib/p2pConnection.ts` — already has staged init for Despia; add a guard so that if `localStream` from a prior call still exists, we stop its tracks before requesting new ones (defensive cleanup).
- `src/components/call/GlobalCallOverlay.tsx` — wrap `p2p.connect()` in try/catch and on failure reset the call store to idle so users aren't stuck on a black overlay after a crash recovery.

## 2. Floating liquid-glass DM header actions

In `src/components/chat/ChatView.tsx` (line ~1361), wrap the existing action cluster (CallButtons + the MoreVertical DropdownMenu trigger) in a single rounded liquid-glass pill and offset it down a few pixels so it visually floats below the header baseline:

```tsx
<div className="flex items-center gap-1 flex-shrink-0 ml-auto translate-y-[3px]">
  <div className="flex items-center gap-0.5 px-1.5 py-1 rounded-full
                  bg-white/5 dark:bg-white/[0.04] backdrop-blur-xl
                  border border-white/10 shadow-[0_4px_18px_-6px_rgba(0,0,0,0.45)]
                  ring-1 ring-inset ring-white/5">
    {/* CallButtons (audio + video) */}
    {/* MoreVertical dropdown trigger */}
  </div>
</div>
```

Move the existing `<DropdownMenu>` trigger inside this pill so the avatar-button, audio, video, and settings icons all share the same floating glass background. Reduce inner button padding to keep the pill compact (`h-8 w-8` inside, outer pill `rounded-full`). The Sheets/DropdownContent stay outside the pill.

## 3. Sync floating FABs with bottom nav visibility

Today `AutoFriendDrop` and `VYBECommandBar` use `useFloatingControlVisibility` (their own scroll listener). The bottom nav uses a different signal (`navVisibility.subscribeEffective`), so they desync — FABs hide/show on raw scroll while the nav animates on a different schedule.

**Fix**: Update `useFloatingControlVisibility` to subscribe to `navVisibility.subscribeEffective` as the source of truth (falling back to its current scroll detection only if no effective signal has been published yet). This guarantees the Friend Link button and AI Designer (VYBECommandBar) always animate in lockstep with the bottom nav — they disappear together on scroll-down and reappear together on scroll-up.

No changes needed in `AutoFriendDrop.tsx` or `VYBECommandBar.tsx` themselves; they already consume `controlVisible`.

## Technical summary

| File | Change |
|---|---|
| `src/lib/callMediaWarmup.ts` | Skip warmup on Despia/native WebView |
| `src/lib/callStore.tsx` | try/catch/finally around `startCall`, reset state on error |
| `src/lib/p2pConnection.ts` | Defensive stop of stale `localStream` before new gUM |
| `src/components/call/CallButtons.tsx` | Despia permission request inside gesture |
| `src/components/call/GlobalCallOverlay.tsx` | Catch `p2p.connect()` failures, reset store |
| `src/components/chat/ChatView.tsx` | Wrap action cluster in floating glass pill, translate-y |
| `src/hooks/useFloatingControlVisibility.ts` | Source visibility from `navVisibility.subscribeEffective` |

After approval, you'll need to **rebuild in Despia** for the call-crash fixes to take effect on the Play Store build (the glass header + FAB sync changes are live immediately on web/PWA).
