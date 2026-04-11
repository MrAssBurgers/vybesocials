

## Fix Call Connection Reliability

The P2P WebRTC calling system has several issues causing connection failures. Here's the root cause analysis and fix plan.

### Root Causes Identified

1. **Race condition: Initiator sends offer before receiver is ready.** The caller inserts a DB record, immediately transitions to `joining`, and fires the P2P connection with only an 800ms static delay. The receiver must: detect the incoming call (via Realtime + polling), accept it, get media permissions, subscribe to the signaling channel, AND reach `SUBSCRIBED` — all before the offer arrives. If the offer is missed, the call hangs until the 30s timeout.

2. **Media permissions requested twice.** `requestCallMediaPermissions` acquires and releases a stream, then `P2PConnection.connect()` acquires another stream. On iOS, this can cause the second `getUserMedia` to fail or delay significantly.

3. **No retry/re-offer mechanism.** If the initial offer is missed (broadcast is fire-and-forget), there's no mechanism to re-send it. The call just sits in "Connecting..." until it times out at 30 seconds.

4. **Free TURN servers are unreliable.** The `openrelay.metered.ca` and `expressturn.com` credentials are public/shared and frequently go offline. When STUN fails (symmetric NAT), these TURN servers may also fail, leaving no path.

5. **No auto-fallback.** When P2P fails, the user gets a toast error and the call ends. There's no automatic retry or fallback to persistent mode.

### Plan

**Step 1: Implement offer retransmission with ready-signal handshake**
- Instead of a blind 800ms delay, have the responder broadcast a `ready` signal once their signaling channel reaches `SUBSCRIBED`
- The initiator waits for this `ready` signal before sending the offer
- Add a fallback: if no `ready` signal within 3 seconds, send the offer anyway (backwards compat)
- Add periodic offer re-send (every 2 seconds, up to 5 times) until an answer is received

**Step 2: Remove double media acquisition**
- Remove the `requestCallMediaPermissions` call in `GlobalCallOverlay`'s join effect for P2P mode, since `P2PConnection.connect()` already calls `getUserMedia`
- This eliminates the iOS race condition where the second `getUserMedia` fails

**Step 3: Add reliable TURN servers via Metered.ca free tier**
- Replace the dead public TURN credentials with Google's additional STUN servers and a more reliable free TURN option
- Add `turn:global.relay.metered.ca:443?transport=tcp` which works through most firewalls

**Step 4: Implement auto-fallback to persistent mode**
- After 2 ICE failures or a 15-second connection timeout in P2P mode, automatically attempt to switch to persistent (LiveKit) mode
- Show a brief "Switching to better connection..." toast
- Only fallback if the user has premium; otherwise show a "Connection failed, try again" with a retry button

**Step 5: Reduce join timeout and add retry**
- Reduce the join timeout from 30s to 15s for P2P
- On timeout, auto-retry the P2P connection once before giving up
- Add an explicit "Retry" button in the UI when connection fails instead of immediately ending the call

### Technical Details

**Files to modify:**
- `src/lib/p2pConnection.ts` — Add `ready` signal, offer retransmission loop, update ICE servers
- `src/components/call/GlobalCallOverlay.tsx` — Remove double media request for P2P, add auto-fallback logic, add retry UI
- `src/lib/callStore.tsx` — Add `retryCall` action, handle fallback state

**New signaling flow:**
```text
Caller                          Receiver
  |-- insert call record -------->|
  |                                |-- detect call (Realtime/poll)
  |                                |-- accept call
  |                                |-- getUserMedia
  |                                |-- subscribe signaling channel
  |                                |-- SUBSCRIBED
  |<---- "ready" signal -----------|
  |-- SDP offer ------------------>|
  |<---- SDP answer ---------------|
  |<-> ICE candidates <----------->|
  |          CONNECTED             |
```

