-- Align bug_reports ownership checks with profile-linked auth users
DROP POLICY IF EXISTS "Users can report bugs" ON public.bug_reports;
CREATE POLICY "Users can report bugs"
ON public.bug_reports
FOR INSERT
TO authenticated
WITH CHECK (
  reporter_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = reporter_id
      AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can view own bug reports" ON public.bug_reports;
CREATE POLICY "Users can view own bug reports"
ON public.bug_reports
FOR SELECT
TO authenticated
USING (
  reporter_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = reporter_id
      AND p.user_id = auth.uid()
  )
);