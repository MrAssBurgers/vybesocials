-- Add SELECT policy for chat-media bucket (was missing)
CREATE POLICY "Chat media is publicly viewable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'chat-media');