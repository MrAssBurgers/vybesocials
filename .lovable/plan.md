
What I found:
- The camera issue is not just permissions: `VybeSnapCamera` still depends on a second “Tap to activate camera” state, and `getUserMedia()` can finish before the `<video>` element is mounted, so the stream is granted but never attached to the preview.
- The DM media issue matches the recent storage hardening: chat uploads are going into the private `chat-media` bucket, but chat bubbles still render raw `message.media_url` values in `<img>`, `<video>`, and `<audio>`. That causes the broken blue box / `?` instead of actual media.
- The app already has pieces of the safety system (`user_safety_settings.dm_content_filter_enabled`, `ReceiverImageFilter`, `useSafetySettings`), but chat settings screens do not expose the toggle consistently and messages do not yet carry enough safety metadata for proper receiver-side blur behavior.

Plan:
1. Fix camera opening so one tap actually starts the live camera
   - Replace the current `setShowSnapCamera(true)` handlers with a single camera-open handler in chat that calls `requestCameraStream()` directly from the camera button / toybox click, then opens the modal.
   - Remove the “Tap to activate camera” overlay from `VybeSnapCamera`.
   - Update `VybeSnapCamera` to auto-attach an already-requested stream on open, and add a mount-time attach effect so if the stream arrives before the `<video>` ref exists, it still connects once the element renders.
   - Keep a proper loading state plus denied/not-found retry states instead of forcing a second tap.

2. Fully fix DM image/video/audio rendering
   - Update chat message rendering to follow the same signed-URL pattern already used elsewhere: never feed private storage URLs directly into message `<img>`, `<video>`, or `<audio>` elements.
   - Resolve signed URLs for all storage-backed message media in chat bubbles, including:
     - images / GIFs
     - videos and posters/thumbnails
     - audio messages
     - any reply/preview usages that still point at raw storage URLs
   - Keep blob/data URLs working for optimistic previews so uploads still appear instantly while sending.

3. Make the chat safety filter receiver-side, not sender-blocking
   - Keep hard platform moderation separate, but make the optional chat filter work the way you described: sender can send, and users who enable the filter see flagged media blurred.
   - Add message safety metadata to `messages` (for example `is_flagged`, `safety_score`, `safety_categories`, and optionally `scan_status`) so the receiver UI knows whether to blur media.
   - Rework the DM/group media display to use a shared blurred-media wrapper for flagged content, with reveal / keep hidden behavior.

4. Add the toggle to chat settings everywhere it belongs
   - Expose the filter in `DMSettingsSheetControlled` for DMs.
   - Expose the same toggle in the group chat settings surface actually used by chat (`GroupInfoSheet`).
   - Back it with the existing safety setting unless testing shows you truly want per-conversation overrides.
   - Update the wording so it clearly means “blur flagged media in chats” instead of “block sending”.

5. Clean up send/scan flow so receiver preference does not punish the sender
   - Review the current DM image/video send gates and remove receiver-driven friction from the sender path.
   - If media still needs scanning for blur decisions, do it without forcing the sender through the current visible gate.
   - Patch the video scan timing guard as part of this pass so `currentTime` never gets `NaN`/`Infinity` on uploaded videos.

6. Backend/database work likely needed
   - Add a migration for message safety metadata on `public.messages`.
   - If the existing client-side-only flow is not enough, add a backend scan/update path so media can be sent first and then marked for blur safely.
   - Do not reopen the `chat-media` bucket publicly; the safer fix is consistent signed URL handling.

Files likely touched:
- `src/components/camera/VybeSnapCamera.tsx`
- `src/components/chat/ChatView.tsx`
- `src/components/chat/VoiceRecorder.tsx`
- `src/components/chat/DMSettingsSheetControlled.tsx`
- `src/components/chat/GroupInfoSheet.tsx`
- `src/hooks/useCameraPreload.ts`
- `src/hooks/useDMSettings.ts`
- likely a new shared chat media safety component
- a new migration for `messages`

QA I would run after implementation:
- Open camera from the chat camera button with one tap only and confirm the live preview appears immediately after permission is granted.
- Send image, GIF, video, and audio in DMs and verify no blue placeholder/question-mark appears before or after refresh.
- Turn the chat safety filter on/off and verify one user can still send while the receiving user sees blurred flagged media.
- Repeat the blur test in group chats to make sure each viewer’s setting is respected.
