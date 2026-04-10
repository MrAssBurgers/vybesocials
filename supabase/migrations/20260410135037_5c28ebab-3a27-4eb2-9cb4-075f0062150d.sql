-- Drop the existing complex SELECT policy
DROP POLICY IF EXISTS "Auth users view chat media" ON storage.objects;

-- Create a simpler policy: any authenticated user can SELECT from chat-media
-- This is safe because the bucket is private (requires signed URLs which require auth)
-- and message-level access is already controlled by conversation membership RLS on messages
CREATE POLICY "Auth users view chat media" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-media');