
## Goal

Make calling feel instant and rock-solid: connect the moment the receiver answers, play the custom ringtone, behave like a Discord voice-room in Stay On mode, kill the pink countdown animation, perfectly center the breathing aura, hide Rejoin after the call truly ends, and broadcast emoji reactions live to the other side.

## What's broken (root causes)

1. **"Call failed" / slow camera & connect**
   - Receiver's `acceptCall` path flips to `joining` but `GlobalCallOverlay` still waits for `state.call.token` for persistent calls and does the LiveKit token fetch inline. For P2P, `P2PConnection.connect()` runs `getUserMedia` in parallel with signaling, but the camera open still blocks the connected event because the join timeout (30s) only fires on real failure — meanwhile no early "media-ready → fast path" is shown.
   - Caller already paints overlay immediately, but receiver shows "Connecting…" until full ICE handshake completes. There is no "media ready / answered" intermediate state.

2. **Custom ringtone not playing**
   - `useSyncCustomSounds` only runs inside `NotificationSoundSection` (settings page). Until the user opens settings, `localStorage['vybe-custom-sounds']` never gets the ringtone URL, so `premiumSounds.startRinging()` falls back to the synth bell.
   - Only the receiver's incoming-call path uses `premiumSounds.startRinging()`; that's correct, but the URL is missing on app boot.

3. **Stay On mode does not behave like a voice room**
   - `currentCall.callMode === 'persistent'` enables linger, but `leaveCall()` clears `globalCallState` and only sets `globalLingeringCall` for the **leaver**. The remaining participant's overlay treats it as `remote-participant-left` and starts the 3-min linger timer (P2P branch). For persistent 1:1, the indefinite branch already exists, but **group calls** still trigger `LINGER_SECONDS = 3600` countdown, and the room still ends when the last participant disconnects from LiveKit (LiveKit auto-closes empty rooms after a short empty-timeout).
   - There is no server-side "keep room alive" flag; the LiveKit room dies when the last person leaves, so the call really does end.

4. **Pink flashing countdown**
   - Lines 1278–1295 (`Remote user left banner`) renders a `bg-primary/20 border border-primary/30` block with a pulsing `bg-primary` dot. With the project's hot-pink/magenta primary token in light mode, this looks pink and frantic. The countdown text also lives inside the avatar block (lines 1185–1193) showing `2:59 Call auto-ends`.

5. **Janky / mis-aligned aura**
   - The avatar wrapper is `inline-flex h-32 w-32`. Multiple `motion.div` children use `style={{ width:'110%', height:'110%' }}` with `-translate-x-1/2 -translate-y-1/2`. They aren't perfectly centered because the parent isn't square in flex layout on iOS; `width/height: 100%` + percent translate creates sub-pixel drift, then the rings beat at three different durations (3s, 3s+0.8s delay, 4s) so they desync visually.

6. **Rejoin button persists after call ends**
   - `CallButtons` reads `getLingeringCall()` at render time. `globalLingeringCall` is only cleared in `endCall()` and `rejoinCall()`. If User A is in persistent mode and User B hangs up (status update → `setState(initialState)`), nothing clears User A's `globalLingeringCall`. Also, the value is non-reactive — `useCallStore` doesn't re-subscribe when it changes, so the button can render stale.

7. **Reaction emojis not delivered**
   - `CallReactions` is wired with `onReaction={(emoji) => { /* broadcast via realtime */ }}` — literally a no-op stub. Nothing is broadcast and `incomingReaction` is never set on the remote side.

---

## Fix plan

### A. Custom ringtone — guarantee URL is loaded on boot
- Move `useSyncCustomSounds()` invocation up to `App.tsx` (or `CallStoreProvider`) so it runs as soon as the user is authenticated.
- Inside `useSyncCustomSounds`, refresh signed URLs that have expired (call upsert again if needed) and write into `localStorage` immediately.
- Verify `premiumSounds.startRinging()` actually awaits `playCustomAudio` and falls back to synth only on hard failure.

### B. Instant connect feel
- In `acceptCall` (callStore), for **P2P**, call `setState({ phase: 'joining', ... })` AND start a non-blocking `premiumSounds.callConnect()` chime so the receiver hears feedback in <100ms.
- In `GlobalCallOverlay.connectP2P`, call `attachLocalVideo` synchronously from `onLocalStream` (already done) but also flip a new `mediaReady` UI flag to switch away from the "Connecting…" overlay the moment camera opens — don't wait for ICE.
- Reduce the connecting overlay (`isConnecting && isVideoCall && !isInitiator`) to dismiss as soon as `hasLocalVideo` is true, not only on `phase === 'connected'`.
- For caller, pre-warm `getUserMedia` synchronously in `CallButtons.handleStartCall` (we already avoid pre-probe — keep that, but skip the artificial 30s `joinTimeoutRef`; reduce to 15s and show "Still trying…" at 8s instead of failing).

### C. Stay-On = real voice-room behavior
- Persistent 1:1: keep current "indefinite linger" path.
- **Group / persistent**: when remote leaves, do NOT show countdown — show "Waiting for others…". Remove the `LINGER_SECONDS = 3600` group countdown; let the local user explicitly leave.
- Keep room alive with a tiny "keepalive" data-channel publish every 20s on persistent so LiveKit doesn't garbage-collect the empty room while one user stays.
- Update edge function `livekit-token` (room creation side) to set `empty_timeout: 600` (10 min) and `max_participants: 50` so the room survives short solo periods.

### D. Kill the pink countdown UI
- Remove the `Remote user left` top banner (lines 1278–1296) entirely for persistent mode. Only show a tiny chip in the header: "Waiting for {name}".
- For P2P 3-minute linger, replace the pink banner + countdown text with a calm white/40% chip "Call ends in 2:59" — no `bg-primary/20`, no pulsing primary dot, no `animate-ping`.
- Inside the avatar block, drop the giant `2:59 Call auto-ends` text (lines 1185–1193). Replace with a single subtle sub-line.

### E. Perfectly aligned beating aura
- Wrap the avatar in a square `relative h-40 w-40 grid place-items-center` container.
- Convert all ring `motion.div`s to absolutely positioned elements with `inset-0` + `m-auto` instead of `top-1/2 left-1/2 -translate -translate`. Use a single shared `width: 100%; height: 100%; aspect-ratio: 1`.
- Synchronize all three rings to the same 3s cycle with phase offsets `0`, `1s`, `2s` (no different durations). Use `ease: 'easeInOut'` so it actually breathes instead of linear pulsing.
- Avatar's own subtle scale uses the same 3s timeline.
- Remove the standby aura's separate 6s timing — just dim opacity, keep the 3s rhythm.

### F. Rejoin button cleanup
- Add a tiny event-emitter wrapper around `globalLingeringCall` so `CallButtons` re-renders when it changes (or expose it through context as `lingeringCall` state on `CallStoreContext`).
- Subscribe to the call status realtime channel app-wide (not just inside an active call) — when a call this user lingered on flips to `status === 'ended'`, clear `globalLingeringCall`.
- Also clear lingering call on logout, and on any new outgoing call start.

### G. Live emoji reactions
- Add a Supabase Realtime broadcast channel `call-reactions-{callId}` opened in `GlobalCallOverlay` for the duration of the call.
- `CallReactions.onReaction` payload: `channel.send({ type: 'broadcast', event: 'reaction', payload: { emoji, userId } })`.
- Receive side: store last emoji in state and pass to `<CallReactions incomingReaction={lastEmoji} />` (which already animates floating emojis).
- Fix the existing `CallReactions` bug: `incomingReaction` causes `setIncomingFloats` during render — wrap in `useEffect([incomingReaction])` instead.

### H. Hangup parity
- When persistent call truly ends (status === 'ended' from DB), force-clear `globalLingeringCall` for both users so the green "Rejoin" button never appears post-hangup.

---

## Files touched

- `src/lib/callStore.tsx` — lingering call event subscription; clear lingering on remote end; reactive lingering exposure; group-call linger removal
- `src/lib/premiumSounds.ts` — robust custom ringtone playback (await + fallback)
- `src/hooks/useCustomSounds.ts` — bootstrap sync from any caller
- `src/App.tsx` — invoke `useSyncCustomSounds` once at app root
- `src/components/call/GlobalCallOverlay.tsx` — aura container rewrite, remove pink banner, instant-connect UX, reactions broadcast wiring, group linger removal
- `src/components/call/CallReactions.tsx` — fix `incomingReaction` effect, expose typed `onReaction`
- `src/components/call/CallButtons.tsx` — re-render on lingering-call change
- `supabase/functions/livekit-token/index.ts` — `empty_timeout: 600`, ensure room creation flags

## Out of scope

- Native push ringtone playback (OS-level CallKit / Android Telecom integration). The web ringtone fix above addresses what the user reported.
