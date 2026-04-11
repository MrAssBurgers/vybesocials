

## Perfect the Calling System — Deep Fix Plan

### Issues Found

1. **P2P calls end immediately when one user leaves** — `handleP2PEvent` for `remote-hangup` calls `endCall()` instantly (line 148-152), killing the call for the remaining user. No linger support for P2P mode.

2. **Double media permission request on accept** — `handleAccept` (line 734) calls `requestCallMediaPermissions()` for ALL modes, then P2P's `connect()` calls `getUserMedia` again. Causes glitchy/failed camera on iOS.

3. **Offer retransmission creates NEW SDP offers each time** — `createAndSendOffer()` calls `createOffer()` + `setLocalDescription()` on each retransmit (line 459-463), invalidating prior ICE candidates and causing connection instability.

4. **No audio quality constraints** — `getUserMedia` called with bare `audio: true` (line 110), missing echo cancellation, noise suppression, auto gain control.

5. **Video camera not optimized for FaceTime-style calls** — No resolution/framerate constraints on video. No `facingMode: 'user'` default for front camera. Video can be choppy or low quality.

6. **Remote audio element positioned offscreen** — Some mobile browsers throttle audio from offscreen elements, causing intermittent audio drops.

7. **No signaling keepalive** — Supabase Realtime channel can go stale during long calls, breaking mid-call renegotiation.

8. **Linger banner only shows for persistent mode** — Line 1092 has `currentMode === 'persistent'` check, so P2P users never see the "call still live" banner.

### Plan

**Step 1: Add P2P linger support**
- When P2P receives `remote-hangup`, instead of calling `endCall()`, set `remoteUserLeft = true` and start a 30-second countdown
- Show the same "Call still live" banner (remove `currentMode === 'persistent'` guard on line 1092)
- If countdown expires, end the call. If remote user reconnects, cancel the countdown
- Change the end button to show "End" during linger (not "Leave")

**Step 2: Fix double media permission for P2P**
- In `handleAccept` (line 730-744), skip `requestCallMediaPermissions()` when call mode is P2P
- P2P's `connect()` handles its own `getUserMedia`

**Step 3: Cache and re-send SDP offer (not recreate)**
- Store the initial offer after `createOffer()` in a `cachedOffer` field
- On retransmit, re-broadcast the cached offer instead of creating a new one
- Prevents ICE candidate invalidation and glitchy connections

**Step 4: Add HD audio constraints**
- Change `audio: true` to `audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }`

**Step 5: Add HD video constraints for FaceTime calls**
- Set `video` constraints: `{ facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }`
- This ensures front camera is used by default with smooth 720p video

**Step 6: Fix remote audio element**
- Change offscreen positioning from `left: -9999` to `opacity: 0, position: fixed, width: 1px, height: 1px` to prevent mobile browser throttling

**Step 7: Add signaling keepalive**
- Send a periodic no-op `ping` signal every 25 seconds on the P2P channel to keep the Supabase Realtime connection alive during long calls
- Add a `keepaliveTimer` field and clean it up in `cleanup()`

### Files to Modify

- **`src/lib/p2pConnection.ts`** — Cache offer, HD audio/video constraints, signaling keepalive, expose `sendHangup()` without full cleanup for linger
- **`src/components/call/GlobalCallOverlay.tsx`** — P2P linger support, fix double media request, fix audio element positioning, remove persistent-only guard on linger banner

