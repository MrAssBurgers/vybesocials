
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-screenshots', 'app-screenshots', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Public read app-screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'app-screenshots');

CREATE POLICY "Owners can manage app-screenshots"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'app-screenshots'
  AND public.has_role(auth.uid(), 'owner')
)
WITH CHECK (
  bucket_id = 'app-screenshots'
  AND public.has_role(auth.uid(), 'owner')
);
