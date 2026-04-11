

## Plan: Bug Fixes and Polish for Dual-Mode Calling System

### Issues Found

1. **Unnecessary `as any` type casts** — `call_mode` exists in the generated types, but the code uses `as any` in 3 places (insert/update). These should be removed for type safety.

2. **Race condition in P2P signaling** — The signaling channel `subscribe()` doesn't wait for `SUBSCRIBED` status before sending the offer. The initiator could send the offer before the channel is ready, causing it to be lost.

3. **P2P callee never sends offer back** — When the callee accepts, both sides set up signaling, but only the initiator creates an offer. If the callee's signaling channel subscribes before the initiator's, the offer may be missed because broadcast `self: false` means no replay of past messages.

4. **Missing `acceptCall` for P2P incoming calls** — When accepting a P2P call, the callee doesn't get a LiveKit token (correct), but the call status update and signaling setup has a timing gap — the DB update happens before the signaling channel is ready.

5. **Double event firing on P2P disconnect** — When `remote-participant-left` fires, `endCall()` is called. But `disconnected` with `reason: 'remote-hangup'` also calls `endCall()`, potentially triggering it twice.

6. **Memory leak in P2P reconnect** — `attemptReconnect` uses `setTimeout` but doesn't store/clear the timeout on cleanup, so reconnect attempts continue after `disconnect()`.

7. **Stale closure in handleP2PEvent** — `endCall` is captured in the callback but the P2PConnection instance holds the initial closure. If endCall changes, the P2P event handler uses the stale reference.

8. **Missing cleanup of auto-end timers on mode switch** — When switching modes, auto-end timers and countdowns from persistent mode are not cleared.

9. **Signaling channel not waited on** — `setupSignaling()` calls `.subscribe()` but doesn't wait for it to reach `SUBSCRIBED` state, leading to lost signals.

### Changes

**File: `src/lib/p2pConnection.ts`**
- Add a `Promise` wrapper around signaling channel subscription to wait for `SUBSCRIBED` status before proceeding
- Store reconnect timeout and clear it in `cleanup()`
- Add guard against double hangup event processing
- Use an event handler ref pattern to avoid stale closures (pass `onEvent` setter)

**File: `src/lib/callStore.tsx`**
- Remove all `as any` casts for `call_mode` (types already support it)
- Remove `(data as any).call_mode` cast — use `data.call_mode` directly
- Add guard in `endCall` to prevent double execution

**File: `src/components/call/GlobalCallOverlay.tsx`**
- Use a ref for the P2P event handler to avoid stale closures
- Add guards in `handleP2PEvent` to prevent double `endCall()` from both `disconnected` and `remote-participant-left`
- Clear auto-end timers during mode switch
- Add small delay after signaling channel ready before sending offer (ensures both sides subscribed)

### Steps
1. Fix P2P signaling race condition (wait for SUBSCRIBED)
2. Fix double-disconnect and stale closure bugs
3. Remove unnecessary `as any` casts
4. Add reconnect timeout cleanup
5. Add mode-switch timer cleanup

