-- Fix sounds bucket: require path-scoped writes (first folder == auth.uid())
DROP POLICY IF EXISTS "Authenticated users can upload sounds" ON storage.objects;

CREATE POLICY "Users can upload their own sounds"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sounds'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);