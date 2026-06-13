-- Android gallery often sends video/3gpp; compressed story images must be image/jpeg.
UPDATE storage.buckets
SET allowed_mime_types = array[
  'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
  'video/mp4','video/quicktime','video/webm','video/3gpp','video/3gpp2'
]
WHERE id = 'stories';

-- Story inserts: use current_profile_id() (matches push_tokens fix).
DROP POLICY IF EXISTS "Users can create own stories" ON public.stories;
CREATE POLICY "Users can create own stories"
  ON public.stories FOR INSERT
  WITH CHECK (author_id = current_profile_id());

DROP POLICY IF EXISTS "Users can delete own stories" ON public.stories;
CREATE POLICY "Users can delete own stories"
  ON public.stories FOR DELETE
  USING (author_id = current_profile_id());
