
-- Restrict three "always-true" write policies to service_role only
-- (Their names already imply server-only writes; the rules just didn't enforce it.)

DROP POLICY IF EXISTS "Service role can insert tips" ON public.tips;
CREATE POLICY "Service role can insert tips"
ON public.tips
FOR INSERT
TO authenticated, anon, service_role
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "System can insert analytics" ON public.sponsor_analytics;
CREATE POLICY "System can insert analytics"
ON public.sponsor_analytics
FOR INSERT
TO authenticated, anon, service_role
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service can update sound analytics" ON public.sound_analytics;
CREATE POLICY "Service can update sound analytics"
ON public.sound_analytics
FOR UPDATE
TO authenticated, anon, service_role
USING ((auth.jwt() ->> 'role') = 'service_role')
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
