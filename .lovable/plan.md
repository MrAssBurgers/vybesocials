

## Plan: Dual-Mode Calling System (P2P + LiveKit)

### Summary
Add a free peer-to-peer WebRTC calling mode as the default, keeping the existing LiveKit system as a premium "Stay On Call" feature. P2P signaling will use Supabase Realtime channels (no new backend needed). Mode switching triggers a controlled reconnect.

### Architecture

```text
┌──────────────────────────────────────────────────┐
│                   Call Store                      │
│  callMode: "p2p" | "persistent"                  │
│                                                   │
│  P2P Mode (free)          Persistent Mode (pro)   │
│  ┌─────────────┐          ┌──────────────────┐   │
│  │ RTCPeer     │          │ LiveKit Room     │   │
│  │ Connection  │          │ (existing code)  │   │
│  │             │          │                  │   │
│  │ Signaling:  │          │ Token from       │   │
│  │ Supabase    │          │ livekit-token    │   │
│  │ Realtime    │          │ edge function    │   │
│  └─────────────┘          └──────────────────┘   │
└──────────────────────────────────────────────────┘
```

### What Changes

**1. Database Migration**
- Add `call_mode` column (`text`, default `'p2p'`) to `calls` table
- Used to coordinate mode between both clients via Realtime subscription

**2. New File: `src/lib/p2pConnection.ts`**
- Encapsulates `RTCPeerConnection` lifecycle
- Uses Google STUN servers (`stun:stun.l.google.com:19302`)
- Signaling via Supabase Realtime broadcast channel (`p2p-signal:{conversationId}`)
- Exchanges SDP offers/answers and ICE candidates
- Handles: connect, disconnect, mute, camera toggle, device switch
- Reconnect on ICE failure with exponential backoff
- Exports a clean interface: `createP2PCall()`, `joinP2PCall()`, `disconnectP2P()`

**3. Update: `src/lib/callStore.tsx`**
- Add `callMode: 'p2p' | 'persistent'` to `CallData` and state
- Default `startCall` to `'p2p'` mode — no edge function call needed, just insert call record and open Realtime signaling channel
- Add `switchMode(mode)` function:
  - Updates `call_mode` in DB (triggers Realtime to other client)
  - Both clients detect change, show "Switching..." UI
  - Tear down current connection (P2P or LiveKit)
  - If switching to `persistent`: fetch LiveKit token, connect to room
  - If switching to `p2p`: create new peer connection via signaling
- Keep all existing LiveKit logic intact for persistent mode
- Add `fallbackToPersistent()` — auto-suggest upgrade if P2P fails

**4. Update: `src/components/call/GlobalCallOverlay.tsx`**
- Dual-mode rendering: use P2P connection OR LiveKit Room based on `callMode`
- Add P2P track attachment (local/remote video/audio via `RTCPeerConnection` tracks)
- Add "Switching to Stay Connected mode..." transitional UI state
- Add "Stay On Call" toggle in call controls:
  - Shows Crown/premium badge
  - Checks `usePremiumStatus()` before enabling
  - If not premium: open `PaywallSheet`
  - If premium: call `switchMode('persistent')`
- P2P reconnect UI: "Reconnecting..." on ICE restart
- Fallback prompt: if P2P fails after 3 attempts, suggest persistent mode

**5. Update: `src/components/call/CallButtons.tsx`**
- Minor: pass `callMode: 'p2p'` as default when starting calls
- "Join Back" button only shows for persistent mode (P2P has no rejoin)

**6. Edge Function: `supabase/functions/livekit-token/index.ts`**
- No changes needed — already handles token generation for persistent mode

**7. P2P Signaling Flow (via Supabase Realtime)**
- Channel: `p2p-signal:{conversationId}`
- Events: `offer`, `answer`, `ice-candidate`, `hangup`, `mode-switch`
- No new edge function required — Realtime broadcast handles it client-side

### Call Flow

**Starting a call (P2P):**
1. Insert call record with `call_mode: 'p2p'`, status `'ringing'`
2. Open Realtime signaling channel
3. Callee detects incoming call (existing Realtime + polling)
4. Callee accepts → joins signaling channel
5. Caller sends SDP offer → Callee sends SDP answer → ICE exchange → connected

**Switching to persistent (premium):**
1. User toggles "Stay On Call" → premium check passes
2. Update `call_mode` to `'persistent'` in DB
3. Both clients detect via Realtime subscription on `calls` table
4. Show "Switching to Stay Connected mode..."
5. Tear down P2P connection
6. Both clients fetch LiveKit token → connect to LiveKit room
7. Resume call in persistent mode

### Premium Gating
- Uses existing `usePremiumStatus()` hook
- Non-premium users see the toggle but get `PaywallSheet` on tap
- `callMode` defaults to `'p2p'` — no server cost for free users

### Cleanup
- P2P: connection ends when either user hangs up (no linger)
- Persistent: existing linger logic (30s for 1:1, 1hr for group)
- Both: call record updated to `'ended'` in DB

### Files

| Action | File |
|--------|------|
| Create | `src/lib/p2pConnection.ts` |
| Edit | `src/lib/callStore.tsx` |
| Edit | `src/components/call/GlobalCallOverlay.tsx` |
| Edit | `src/components/call/CallButtons.tsx` |
| Migration | Add `call_mode` column to `calls` table |

### Steps
1. Run database migration (add `call_mode` column)
2. Create `p2pConnection.ts` (WebRTC + Supabase Realtime signaling)
3. Update `callStore.tsx` (dual-mode state, mode switching, P2P start flow)
4. Update `GlobalCallOverlay.tsx` (P2P rendering, "Stay On Call" toggle, switching UI)
5. Update `CallButtons.tsx` (default to P2P mode)

