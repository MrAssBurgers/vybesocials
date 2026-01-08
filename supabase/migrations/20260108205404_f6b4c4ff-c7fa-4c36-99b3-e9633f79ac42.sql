-- Make the chat-media bucket public so images can be displayed
UPDATE storage.buckets SET public = true WHERE id = 'chat-media';

-- Also ensure there are proper storage policies for the bucket
DO $$
BEGIN
  -- Drop existing policies if they exist and recreate
  DROP POLICY IF EXISTS "Users can upload chat media" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can view chat media" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete own chat media" ON storage.objects;
END $$;

-- Allow authenticated users to upload to their folder
CREATE POLICY "Users can upload chat media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow anyone to view chat media (since bucket is public)
CREATE POLICY "Anyone can view chat media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat-media');

-- Allow users to delete their own media
CREATE POLICY "Users can delete own chat media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);