-- Create storage bucket for chat media (images and voice messages)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

-- Create policies for chat-media bucket

-- Users can upload their own media (files in their own folder)
CREATE POLICY "Users can upload chat media"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'chat-media' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Anyone can view chat media (public bucket)
CREATE POLICY "Chat media is publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'chat-media');

-- Users can delete their own media
CREATE POLICY "Users can delete their own chat media"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'chat-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);