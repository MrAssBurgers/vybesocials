

## Plan: Final Polish — Bug-Free Dual-Mode Calling System

### Issues Found

After a deep scan of all calling system files, the build logs (clean — no errors), the edge function, and the database linter, here are the remaining issues:

**1. Type mismatch: `acceptCall` signature says `void` but implementation is `async`**
In `callStore.tsx`, the interface declares `acceptCall: (call: CallData) => void` but the implementation is `async`. This means callers (like `handleAccept` in `GlobalCallOverlay`) don't await the result, so errors during acceptance (e.g. failed LiveKit token fetch) silently reject.

**2. Missing error feedback on `switchMode` failure**
In `callStore.tsx` line 566-573, if switching to persistent mode fails (bad token), the DB mode is reverted but no toast or error state is shown to the user.

**3. Missing error feedback on `handleStayOnCallToggle`**
In `GlobalCallOverlay.tsx`, `switchMode` is called without `try/catch`, so if it fails the user gets no feedback.

**4. `p2pRef.current.disconnect()` not awaited on idle cleanup**
In `GlobalCallOverlay.tsx` line 500, the async `disconnect()` is called without `await`, potentially causing cleanup race conditions.

**5. Edge function creates duplicate call records**
The `livekit-token` edge function (line 177-202) creates a NEW call record when called without `callId`. But `switchMode` in `callStore.tsx` already passes `callId`, so this path is only hit if someone calls the function directly without `callId` — not a user-facing bug but worth noting.

**6. `profile` possibly `null` in `Object.assign` (edge function line 90)**
If the first profile query returned `null` (not just error), `Object.assign(profile || {}, p2)` assigns to a new empty object that isn't used. `profile!` on line 93 would then throw. This is an edge case but should use proper reassignment.

**7. Incoming call auto-decline timer doesn't clear on unmount properly**
In `IncomingCallDialog`, `onDecline` is in the `useEffect` dependency for the timer but isn't wrapped in a ref — if `onDecline` changes identity, the interval restarts.

### Changes

**File: `src/lib/callStore.tsx`**
- Fix `acceptCall` interface type to `Promise<void>`
- Add toast error on `switchMode` persistent failure
- Wrap `switchMode` body in try/catch with user feedback

**File: `src/components/call/GlobalCallOverlay.tsx`**
- Wrap `handleStayOnCallToggle`'s `switchMode` call in try/catch with toast
- Await `p2pRef.current.disconnect()` in idle cleanup effect
- Use a ref for `onDecline` in `IncomingCallDialog` to prevent timer restart

**File: `supabase/functions/livekit-token/index.ts`**
- Fix the `profile` reassignment to use a `let` variable properly

### Steps
1. Fix type signature and add error handling in callStore
2. Add try/catch and await fixes in GlobalCallOverlay
3. Fix profile reassignment in edge function
4. Stabilize IncomingCallDialog timer

