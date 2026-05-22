DROP POLICY IF EXISTS "Anyone can log impressions" ON public.ad_impressions;

CREATE POLICY "Authenticated users can log impressions"
ON public.ad_impressions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    viewer_id IS NULL
    OR viewer_id IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);