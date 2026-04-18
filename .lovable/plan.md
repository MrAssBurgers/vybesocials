
Adding call auto-reconnect on page refresh to the existing plan.

### Updated plan — 5 fixes in `GlobalCallOverlay.tsx` + `callStore.tsx`

**1. Settings button does nothing**
Remove `disabled={!isConnected}` on the gear button (line ~1239) so settings open in any call state.

**2. PiP camera can't reach corners**
- Add `callContainerRef` on the fullscreen call container.
- Replace pixel `dragConstraints` with `dragConstraints={callContainerRef}` so it can travel edge-to-edge.
- Add `onDragEnd` handler that measures release position and snaps to the nearest of 4 corners (top-left, top-right, bottom-left, bottom-right) via `useAnimationControls`.

**3. Mic auto-mutes when app backgrounded / screen off**
- In the `visibilitychange` handler, on return to `visible`: re-call `p2pRef.current.setMicEnabled(!isMuted)` (P2P) or `roomRef.current.localParticipant.setMicrophoneEnabled(!isMuted)` (LiveKit) to force-resume the suspended track.
- Listen to the local audio track's `mute` event and auto re-enable when `!isMuted`.
- Request `navigator.wakeLock.request('screen')` on call start, release on end.

**4. "Auto-ends in 3:00" still shown in persistent Stay-On state**
In the avatar caption block (~line 1116), branch on `autoEndCountdown === -1`: show "They can rejoin anytime" with no timer; otherwise keep the existing `m:ss` countdown.

**5. NEW — Auto-reconnect to call on page refresh**
- In `callStore.tsx`: on every meaningful call state change (start, mode switch, mute toggle), persist a snapshot to `sessionStorage` under `vybe-active-call`: `{ peerId, peerName, peerAvatar, callType, callMode, isGroupCall, conversationId, startedAt }`. Clear on `endCall()`.
- On `callStore` mount: read `sessionStorage`. If a snapshot exists AND `Date.now() - startedAt < 30min`, dispatch a "rejoin" action that restores call state and re-establishes the P2P/LiveKit connection using existing `startCall` / `joinPersistentRoom` logic with a `isReconnect: true` flag (skips ringing UI, goes straight to connecting).
- Show a brief "Reconnecting…" toast during the rejoin window. If reconnect fails within 8s, clear the snapshot silently.
- For persistent (Stay-On) calls: always try to reconnect. For default calls: only reconnect if refresh happened within 60s (avoid resurrecting stale calls).

### Files to edit
- `src/components/call/GlobalCallOverlay.tsx` — fixes 1-4
- `src/state/callStore.tsx` (or wherever the call store lives) — fix 5: persistence + auto-rejoin
- (No changes to `CallSettingsSheet.tsx` or `p2pConnection.ts`)

### Expected result
- Gear opens settings in any call state.
- Local PiP drags to all 4 corners and snaps cleanly on release.
- Mic stays live when you switch apps or lock the screen.
- Stay-On shows "They can rejoin anytime" — no false 3-min timer.
- Refreshing the page silently rejoins the active call within seconds (always for Stay-On, within 60s for default).
