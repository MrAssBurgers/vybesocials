

## Plan: Replace Daily.co Calling System with LiveKit

### Summary
Replace the entire Daily.co-powered calling system with a LiveKit-based WebRTC system. This involves a new edge function for token generation, new frontend components using the LiveKit SDK, and reuse of the existing `calls` database table with minor schema additions.

### What Changes

**1. Database Migration**
- Add `room_id` column to `calls` table (the conversationId-based persistent room identifier)
- Add `active_participants` integer column (track how many users are in the room)
- Keep existing columns (room_url, room_name, status, etc.) but repurpose them for LiveKit

**2. New Secret Required**
- `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` — user must provide these from their LiveKit Cloud dashboard
- `LIVEKIT_URL` — the LiveKit server WebSocket URL (e.g. `wss://your-app.livekit.cloud`)

**3. New Edge Function: `livekit-token`**
- Replaces both `create-call-room` and `get-call-token`
- Generates a LiveKit access token using `livekit-server-sdk` (npm package available in Deno)
- Token includes: roomId (= conversationId), userId (= profile.id), display name, publish + subscribe permissions
- Creates/updates the `calls` record in the database
- Validates user is a member of the conversation

**4. Delete Edge Functions**
- `create-call-room` (Daily.co room creation)
- `get-call-token` (Daily.co token generation)

**5. Remove npm Dependency**
- Uninstall `@daily-co/daily-js`
- Install `livekit-client` (~50KB, much lighter than Daily)

**6. Rewrite `src/lib/callStore.tsx`**
- Same state machine: idle → creating → joining → connected → ending → idle
- Same incoming call detection via Supabase Realtime + polling fallback
- `startCall` now calls the `livekit-token` edge function instead of `create-call-room`
- Room identifier = conversationId (persistent per DM)
- `rejoinCall` uses same roomId to reconnect
- Linger/leave logic preserved (leave without ending room)

**7. Rewrite `src/components/call/GlobalCallOverlay.tsx`**
- Replace `DailyIframe.createCallObject()` with LiveKit `Room` + `connect()`
- Use LiveKit's `RoomEvent` listeners (TrackSubscribed, TrackUnsubscribed, ParticipantConnected, ParticipantDisconnected, Reconnecting, Reconnected, Disconnected)
- Built-in reconnection: LiveKit handles network drops, app sleep, and reconnection automatically
- Same UI structure: full-screen overlay, mute/unmute, camera on/off, camera switch, minimize bubble
- Same call sounds integration (callSounds, premiumSounds)
- Same iOS autoplay handling

**8. Update `src/components/call/CallButtons.tsx`**
- Minimal changes — same interface, just calls the updated callStore

**9. Keep Unchanged**
- `CallSettingsSheet.tsx` — adapt device enumeration to use LiveKit's `Room.getLocalDevices()`
- `MinimizedCallBubble.tsx` — no changes needed (pure UI)
- `callSounds.ts`, `premiumSounds.ts` — no changes
- `mediaPermissions.ts` — still used for pre-call permission checks
- Database RLS policies — still valid
- Incoming call detection (Realtime + polling) — same pattern

### Technical Architecture

```text
┌─────────────┐     POST /livekit-token      ┌──────────────────┐
│  Frontend   │ ──────────────────────────►   │  Edge Function   │
│  (React)    │                               │  livekit-token   │
│             │  ◄─── { token, url, callId }  │                  │
│  livekit-   │                               │  - Auth check    │
│  client SDK │                               │  - Generate JWT  │
│             │     WebSocket (wss://)        │  - Upsert call   │
│             │ ──────────────────────────►   │                  │
│             │        LiveKit Cloud          └──────────────────┘
└─────────────┘
```

### Reconnection Strategy
- LiveKit SDK has built-in reconnection (exponential backoff, ICE restart)
- On `RoomEvent.Reconnecting` → show "Reconnecting..." UI
- On `RoomEvent.Reconnected` → restore normal UI
- On `RoomEvent.Disconnected` → if room still active in DB, show "Rejoin" button
- On app foreground (visibilitychange) → check if room is still active, auto-rejoin

### Room Lifecycle
- Room is "active" as long as ≥1 participant is connected
- When both leave → edge function or client marks call as `ended`
- LiveKit rooms auto-close when empty (configurable `empty_timeout` on server)

### Cleanup of Old System
- Remove `@daily-co/daily-js` from package.json
- Delete `supabase/functions/create-call-room/`
- Delete `supabase/functions/get-call-token/`
- Remove Daily-specific code from `useCameraPreload` hook (if any)

### Steps
1. Add LiveKit secrets (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`)
2. Install `livekit-client` dependency
3. Create `livekit-token` edge function
4. Run database migration (add columns to calls table)
5. Rewrite `callStore.tsx` for LiveKit flow
6. Rewrite `GlobalCallOverlay.tsx` with LiveKit Room SDK
7. Update `CallSettingsSheet.tsx` device enumeration
8. Update `CallButtons.tsx` (minor)
9. Remove Daily.co dependency and old edge functions
10. Test end-to-end

