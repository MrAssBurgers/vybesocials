-- Create dedicated stories storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'stories', 
  'stories', 
  true,
  52428800, -- 50MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for stories bucket
CREATE POLICY "Anyone can view stories" ON storage.objects
FOR SELECT USING (bucket_id = 'stories');

CREATE POLICY "Authenticated users can upload stories" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'stories' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own stories" ON storage.objects
FOR DELETE USING (
  bucket_id = 'stories'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Add aspect_ratio and duration columns to stories if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'aspect_ratio') THEN
    ALTER TABLE public.stories ADD COLUMN aspect_ratio float DEFAULT 0.5625; -- 9:16 default
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'duration') THEN
    ALTER TABLE public.stories ADD COLUMN duration integer; -- null for images, seconds for video
  END IF;
END $$;

-- Create simple indexes for faster story queries (no predicate)
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON public.stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_author_created ON public.stories(author_id, created_at DESC);