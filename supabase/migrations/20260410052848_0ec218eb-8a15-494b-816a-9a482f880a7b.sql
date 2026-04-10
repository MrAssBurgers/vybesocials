
-- Add media_type column to announcements
ALTER TABLE public.announcements ADD COLUMN media_type TEXT DEFAULT 'image';

-- Create announcements storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('announcements', 'announcements', true, 52428800, 
  ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','video/webm']);

-- Public read access
CREATE POLICY "Anyone can view announcement media"
ON storage.objects FOR SELECT
USING (bucket_id = 'announcements');

-- Authenticated users can upload
CREATE POLICY "Authenticated users can upload announcement media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'announcements' AND auth.role() = 'authenticated');

-- Authenticated users can update their uploads
CREATE POLICY "Authenticated users can update announcement media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'announcements' AND auth.role() = 'authenticated');

-- Authenticated users can delete their uploads
CREATE POLICY "Authenticated users can delete announcement media"
ON storage.objects FOR DELETE
USING (bucket_id = 'announcements' AND auth.role() = 'authenticated');
