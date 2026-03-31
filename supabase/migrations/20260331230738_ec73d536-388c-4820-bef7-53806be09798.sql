
-- FIX 1: Restrict tips INSERT policy to service_role only
DROP POLICY IF EXISTS "Service role can insert tips" ON public.tips;
CREATE POLICY "Service role can insert tips"
  ON public.tips FOR INSERT
  TO service_role
  WITH CHECK (true);

-- FIX 3: Remove blanket profiles SELECT - keep owner-only
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;

-- FIX 4: Restrict chat-media SELECT policies  
DROP POLICY IF EXISTS "Auth users view chat media" ON storage.objects;
DROP POLICY IF EXISTS "Chat media is publicly viewable" ON storage.objects;

CREATE POLICY "Auth users view chat media" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media' AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM public.conversation_members cm1
        JOIN public.conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
        WHERE cm1.user_id = auth.uid()
          AND cm2.user_id::text = (storage.foldername(name))[1]
      )
    )
  );
