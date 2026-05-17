# Plan: Fix DMs, push delivery, and audio-call camera UI

## What I found

There are now three separate issues:

1. **Sent messages can fail to appear in the chat UI immediately.**
   - `ChatView` clears the input before awaiting `sendText()`.
   - `useInstantSend` is responsible for the optimistic bubble, but it does not register the optimistic message with the global realtime dedupe helper already defined in `useGlobalRealtimeMessages`.
   - A refetch/realtime event can race the optimistic update, so the sender can see the bubble disappear or never visibly land.

2. **Phone push notifications are failing because web push subscriptions were created with the wrong VAPID public key.**
   - Edge logs show `VapidPkHashMismatch` / `403 VAPID credentials do not correspond...`.
   - `usePushNotifications.ts` falls back to a hardcoded sample public key, while the backend signs with the real private key.
   - Existing browser push subscriptions must be re-created with the matching public key.

3. **Audio-call animation/camera upgrade needs final polish.**
   - The visualizer should be centered off the avatar/ring, not scaled by loose percentage wrappers.
   - Camera enable during an audio call should be driven by actual local video track state, and the camera request must happen directly from the button tap.

## Implementation

### 1. Make sent DMs always show in chat

- Update `src/hooks/useInstantSend.ts` to call `registerOptimisticMessage(conversationId, content, profile.id)` when a text message is optimistically added.
- Strengthen `confirmMessage()` so if a temp bubble was wiped by a refetch, the confirmed server message is appended instead of doing nothing.
- Apply the same “append if missing” behavior for media/video confirmation paths.
- Add best-effort conversation-list patching immediately after confirmed send so the thread row updates without waiting for a refetch.
- In `src/components/chat/ChatView.tsx`, make `handleSend` await `sendText()` and restore the draft if the send fails, so a failed send does not look like the message vanished.

### 2. Fix DM push notifications on phones

- Add a small backend function `get-vapid-key` that returns the current public VAPID key from backend secrets.
- Update `src/hooks/usePushNotifications.ts` to fetch/cache that key instead of using the hardcoded sample fallback.
- If the key cannot be loaded, show a clear error and do not create a broken subscription.
- Add a one-time migration to delete stale `web` push tokens so browsers re-subscribe with the correct key next time users enable/open push. Native/Despia tokens stay untouched.

### 3. Finalize audio-call animation + camera during audio calls

- Recheck `src/components/call/GlobalCallOverlay.tsx`.
- Center the `AudioVisualizer` with fixed avatar-relative dimensions so the ring does not drift in audio calls.
- Ensure the video button appears for connected audio calls.
- Ensure enabling camera in an audio call requests video directly from the tap handler and attaches the local track/PiP immediately.

## Technical notes

- No change to the generated Supabase client/types files.
- Realtime on `messages` is already enabled in migrations, so I will not duplicate that unless the live backend says otherwise.
- The push fix requires backend secrets `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` to match. If one is missing, I will ask for the missing secret before finishing the push part.

## Verification

- Send a DM and confirm the sender immediately sees the bubble in the active chat.
- Confirm failed sends keep/restore text instead of silently disappearing.
- Confirm `send-push-notification` logs stop showing `VapidPkHashMismatch` after re-subscribe.
- Start an audio call, confirm the visualizer is centered and the camera button upgrades the call without dropping it.
