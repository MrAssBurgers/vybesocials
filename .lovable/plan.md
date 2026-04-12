

## Fix Calls and Other Critical Errors

### Issues Identified

1. **Calls fail with `NotReadableError: Could not start video source`** — The P2P connection requests `getUserMedia` for video, but the VybeSnapCamera may still be holding the camera. On iPhone, only one process can hold the camera at a time. The call flow never releases the existing camera stream before trying to acquire a new one.

2. **`posts.user_id does not exist` (HTTP 400)** — Two files query `posts` using a non-existent `user_id` column:
   - `src/pages/Search.tsx` line 55: `profiles!user_id` join hint (should be `profiles!author_id`)
   - `src/components/recap/WeeklyRecapModal.tsx` line 60: `.eq('user_id', user.id)` (should be `.eq('author_id', user.id)`)

3. **`Failed to set remote answer sdp: Called in wrong state: stable`** — The answer handler at line 501 already guards against this, but the offer handler at line 481 does a `setRemoteDescription` even when `hasRemoteDescription` is true, which can race with an existing stable state. Need to check `signalingState` before re-applying an offer.

4. **Conversations 403 RLS** — `src/hooks/useFriends.ts` line 256 does a direct `.insert()` into `conversations` instead of using the `create_dm_conversation` RPC. The RPC is SECURITY DEFINER and handles this correctly. Replace the direct insert with the RPC call.

5. **`user_levels` 403 RLS** — The insert at `src/hooks/useVybePass.ts` line 72 and `src/hooks/useBattlePass.ts` line 76 tries to insert when no row exists. This may fail if the user session isn't fully established yet. Add an `enabled` guard and catch gracefully.

6. **`DialogContent requires DialogTitle`** — Missing `DialogTitle` in some dialog component (accessibility warning).

### Plan

#### File: `src/lib/p2pConnection.ts`
- In `connect()`, before calling `getUserMedia`, import and call `stopCameraStream()` from `useCameraPreload` to release any held camera
- In the offer handler (line 481), add a `signalingState` check before calling `setRemoteDescription` on re-offers to avoid the "stable" state error

#### File: `src/pages/Search.tsx`
- Line 55: Change `profiles!user_id` to `profiles!author_id` in the select join hint

#### File: `src/components/recap/WeeklyRecapModal.tsx`
- Line 60: Change `.eq('user_id', user.id)` to `.eq('author_id', user.id)`

#### File: `src/hooks/useFriends.ts`
- Replace the direct `conversations` insert (lines 256-263) + `conversation_members` insert (lines 269-272) with a call to `supabase.rpc('create_dm_conversation', { other_profile_id: receiverId })`

#### File: `src/hooks/useVybePass.ts` and `src/hooks/useBattlePass.ts`
- Wrap the `user_levels` insert in a try-catch so a 403 doesn't crash the flow; log and continue gracefully

#### File: `src/lib/mediaPermissions.ts`
- In `requestCallMediaPermissions`, import and call `stopCameraStream()` before requesting any media to ensure the camera is free

### Files to modify
- `src/lib/p2pConnection.ts` — release camera before call, fix offer re-negotiation
- `src/lib/mediaPermissions.ts` — stop existing camera before permission check
- `src/pages/Search.tsx` — fix `user_id` → `author_id`
- `src/components/recap/WeeklyRecapModal.tsx` — fix `user_id` → `author_id`
- `src/hooks/useFriends.ts` — use `create_dm_conversation` RPC
- `src/hooks/useVybePass.ts` — graceful user_levels insert
- `src/hooks/useBattlePass.ts` — graceful user_levels insert

