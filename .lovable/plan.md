
Fix VYBE snaps by addressing the actual failure path in both backend access and viewer timing.

1. Fix chat-media access so recipients can read each other’s snap files
- Add a migration to correct the storage SELECT policy for `chat-media`.
- Right now the policy compares the uploader’s auth user id in the storage path to `conversation_members.user_id`, which stores profile ids. That mismatch prevents recipients from getting signed URLs for each other’s uploads.
- Update the policy to resolve the uploader through `profiles.user_id` (or otherwise compare like-for-like ids) so members of the same DM/group can access the file.
- Keep the bucket private; use authenticated access correctly instead of making everything public.

2. Make VYBE uploads store files in a path that matches the fixed policy consistently
- Review `ChatView.handleVybeSend` and align the upload path and message insert flow with the corrected storage policy.
- Keep using auth user id in the file path if policy checks auth ids, or switch to profile id only if policy is updated to that convention everywhere.
- Also harden image parsing so only real data URLs are accepted before upload.

3. Fix `VybeViewer` so it waits for the signed URL instead of failing early
- The current viewer renders `resolvedUrl = signedUrl || mediaUrl`.
- For private bucket media, `mediaUrl` is a non-working raw storage URL for recipients, so the `<img>` errors before the signed URL arrives and `imgError` gets stuck on.
- Change the viewer to:
  - show a loading state while a private storage URL is still being signed
  - use the raw URL only for non-storage/public/blob/data URLs
  - reset `imgError` whenever `mediaUrl`, `signedUrl`, or `isOpen` changes
  - only show “Media no longer available” after the signed URL path actually fails

4. Stop consuming a snap before it has displayed successfully
- In `VybeViewer`, don’t mark the snap as viewed immediately on open.
- Mark it viewed only after the image/video has successfully loaded enough to display.
- This prevents “tap once -> broken -> snap marked opened forever” behavior.

5. Improve the closed-state preview tile in chat
- In `ChatView`, use a signed/background-safe preview source for the unopened VYBE tile instead of the raw private storage URL.
- If signing is still pending, show the branded gradient card without trying to paint the background image yet.
- This removes broken preview/background behavior before the snap opens.

6. Keep existing Snapchat-style UX intact
- Preserve fullscreen viewer, reply gesture, progress bar, and “Opened” status.
- Preserve the current no-auto-close logic from realtime updates.
- Only change the loading/access logic, not the core interaction model.

Technical details
- Root cause 1:
  `chat-media` is private, but the latest storage policy checks:
  uploader folder name = auth uid
  conversation_members.user_id = profile id
  Those ids are different types in this app, so recipient access fails.
- Root cause 2:
  `useSignedUrl()` is async. `VybeViewer` renders the raw private URL first, image load fails, `imgError` becomes `true`, and the fallback UI appears permanently.
- Root cause 3:
  the snap is marked viewed too early, before successful media render.

Files likely involved
- `src/components/chat/VybeViewer.tsx`
- `src/components/chat/ChatView.tsx`
- `src/lib/signedUrlCache.ts` or signed-url usage pattern
- new migration in `supabase/migrations/...` for `chat-media` SELECT policy

Verification checklist
- Send photo VYBE from user A to user B
- Open it on user B and confirm the real image displays fullscreen
- Confirm it is marked opened only after successful display
- Confirm the unopened preview card no longer breaks
- Test both sender and receiver on fresh app load
- Test again with video VYBE to ensure signed URL loading still works
