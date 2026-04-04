-- Fix chat-media SELECT policy: conversation_members.user_id stores profile IDs,
-- but auth.uid() returns auth UIDs, and the file path folder is also auth UID.
-- We need to join through profiles to bridge the gap.

DROP POLICY IF EXISTS "Auth users view chat media" ON storage.objects;

CREATE POLICY "Auth users view chat media" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-media' AND (
    -- Owner: auth UID matches folder name
    (auth.uid())::text = (storage.foldername(name))[1]
    OR
    -- Conversation member: current user is in same conversation as the file owner
    EXISTS (
      SELECT 1
      FROM public.profiles AS uploader_profile
      JOIN public.conversation_members AS cm_uploader
        ON cm_uploader.user_id = uploader_profile.id
      JOIN public.conversation_members AS cm_viewer
        ON cm_viewer.conversation_id = cm_uploader.conversation_id
      JOIN public.profiles AS viewer_profile
        ON cm_viewer.user_id = viewer_profile.id
      WHERE
        -- uploader's auth UID matches the folder in the file path
        uploader_profile.user_id = (storage.foldername(name))[1]::uuid
        -- viewer's auth UID matches the requesting user
        AND viewer_profile.user_id = auth.uid()
    )
  )
);