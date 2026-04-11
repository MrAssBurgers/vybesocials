-- Ensure the overly permissive "Chat media is publicly viewable" SELECT policy is removed
-- This was dropped in a previous migration but the scanner still detects it
DROP POLICY IF EXISTS "Chat media is publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Chat media is publicly accessible" ON storage.objects;

-- Verify the secure policy exists (re-create if needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Auth users view chat media'
  ) THEN
    CREATE POLICY "Auth users view chat media" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'chat-media' AND (
        (auth.uid())::text = (storage.foldername(name))[1]
        OR
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
            uploader_profile.user_id = (storage.foldername(name))[1]::uuid
            AND viewer_profile.user_id = auth.uid()
        )
      )
    );
  END IF;
END $$;