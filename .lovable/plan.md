## Goal
Make calls open and connect **instantly** — get the camera preview and overlay visible the moment the user taps the call/answer button, instead of waiting on signaling, push fan-out, and serialized media + transport setup.

## Root causes found in the call flow

1. **Caller has 4 awaited round-trips before the overlay even paints**
   `CallButtons.handleStartCall` does:
   - `await requestCallMediaPermissions(callType)` (full getUserMedia probe)
   - then `await startCall(...)` which does:
     - `await supabase.from('calls').insert(...)` (DB round-trip)
     - **`await Promise.all(targetIds.map(supabase.functions.invoke('send-push-notification')))`** — blocks UI on edge function fan-out (slowest single thing here)
   - Only **after** all of that does `setState({phase:'joining'})` fire and the overlay/camera mount.
   File: `src/lib/callStore.tsx` lines 583–619 (push fan-out is awaited even though comment says "fire-and-forget").

2. **Local camera preview waits for signaling to finish**
   In `P2PConnection.connect()` (`src/lib/p2pConnection.ts` lines 109–217), the order is:
   1. `stopCameraStream()` + 150 ms hard sleep
   2. `getUserMedia` (HD constraints)
   3. `createPeerConnection`
   4. `addTrack`
   5. **`await setupSignaling()`** — waits for Realtime SUBSCRIBED before anything visible
   6. `startKeepalive` → handshake
   The local stream is only handed to the overlay (`p2p.getLocalStream()`) **after** `connect()` resolves (overlay line 300-307). So the user sees nothing until signaling is up.

3. **Forced 150 ms `setTimeout` delay** at the top of `P2PConnection.connect()` (line 114) — pure latency, not needed when we already stopped the stream synchronously.

4. **HD-first getUserMedia is slow on mobile**. We currently ask for 1280×720 @30fps up-front. Mobile cameras take noticeably longer to open at HD. Most other apps open at SD then upscale.

5. **Acceptor side is also serialized**
   `acceptCall` (`callStore.tsx` lines 632–675) awaits:
   - `supabase.from('calls').update(...)` (DB)
   - then for persistent: `await supabase.functions.invoke('livekit-token', ...)` (edge function)
   Only then transitions to `joining`. The DB status update can happen in the background.

6. **Overlay's `joining` effect re-requests permissions** for persistent mode (`requestCallMediaPermissions`) before connecting, adding another full media probe (overlay line 473–481).

## Plan — instant-feel call open

### A. callStore.tsx — make `startCall` paint the overlay first

1. Reorder so `setState({phase:'joining', call: callData, ...})` happens **immediately after** the local DB insert resolves (or even optimistically with a temp id, then patched).
2. Make the push-notification fan-out **truly fire-and-forget**:
   - Drop `await Promise.all(...)`.
   - Wrap in `void (async () => { ... })()` so the call UI isn't blocked.
3. For 1:1 P2P calls, we don't need an edge function at all — the only awaited work is the `calls` row insert. That stays.
4. For group/persistent (LiveKit token), kick off `livekit-token` invoke **in parallel** with `setState` and patch the call object once the token arrives (overlay already handles `connectToRoom` once it has a token; we can move overlay to wait on `state.call.token` becoming non-empty).

### B. CallButtons.tsx — don't block on permission probe

- Remove the `await requestCallMediaPermissions(callType)` before `startCall`. `P2PConnection.connect()` already calls `getUserMedia` itself (the comment in overlay even says doing both causes iOS failures). Browser permission prompt still fires from the gesture inside getUserMedia.
- Drop the `isStarting` spinner state's blocking await — flip phase straight to `joining` so the overlay opens immediately.

### C. p2pConnection.ts — open camera FIRST, signal in parallel

Reorder `connect()`:
1. Remove the 150 ms `setTimeout` after `stopCameraStream()` (camera tracks are stopped synchronously).
2. Lower default video constraints to **640×480 @24fps** initially (still good preview, ~3-5× faster on mobile). Optionally upgrade to 720p via `applyConstraints` after connect.
3. Run `getUserMedia` and `setupSignaling()` **in parallel** with `Promise.all`. Today they're sequential — we waste signaling RTT while the camera opens.
4. Emit a new `local-stream-ready` event (or just expose `getLocalStream()` synchronously and add an `onLocalStream` callback) so `GlobalCallOverlay` can attach the local preview the moment the camera is live, without waiting for signaling.

### D. GlobalCallOverlay.tsx — attach local preview ASAP

1. Subscribe to the new `local-stream-ready` (or poll `p2pRef.current.getLocalStream()` once on a microtask after `new P2PConnection`) and call `attachLocalVideo(videoTrack)` immediately — instead of only after `await p2p.connect()` returns.
2. Remove the `requestCallMediaPermissions` call inside the joining effect for persistent mode (LiveKit's `setMicrophoneEnabled/setCameraEnabled` handles the prompt inline). This deletes a duplicate full-media probe.

### E. acceptCall — accept first, sync DB after

- Move the `calls` row update (`status: 'accepted'`) to fire-and-forget.
- For persistent mode, transition to `phase: 'joining'` immediately and let LiveKit token fetch happen in the overlay (or store pending).

### F. Preflight: cheap permissions cache

- On first call attempt, persist `mediaPermissionGranted = true` in `sessionStorage` after a successful getUserMedia. Skip the heavy `requestCallMediaPermissions` probe entirely on subsequent calls in the same session.

## Files to change

```text
src/lib/callStore.tsx          # fire-and-forget push, parallel token, faster phase flip
src/components/call/CallButtons.tsx   # drop pre-probe, no await blocking UI
src/lib/p2pConnection.ts       # parallel getUserMedia+signaling, lower res default, drop 150ms sleep, emit local-stream-ready
src/components/call/GlobalCallOverlay.tsx  # attach local preview before connect resolves; drop dup permission probe
src/lib/mediaPermissions.ts    # add session cache short-circuit
```

## Expected outcome

- Tap call → overlay paints in **~50 ms** (DB insert), local camera preview in **~200-500 ms** (depending on device), remote connect timing unchanged but no longer blocks the UI.
- Receiving a call → tapping Answer transitions to the call screen instantly; DB status update no longer blocks.

## Risk / mitigations

- Lower default resolution: still upgradable post-connect via `applyConstraints`. No quality regression on persistent (LiveKit) mode (handled by adaptive stream).
- Fire-and-forget push: if push fails, receiver still rings via Realtime+polling (already in place at lines 285–333). No regression.
- Removing pre-probe in CallButtons: getUserMedia inside P2PConnection still triggers the prompt from the same user gesture (synchronous path through to `connect()`), so iOS gesture rules are preserved.
