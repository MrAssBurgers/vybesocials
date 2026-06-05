-- Restrict client-side SELECT on app_secrets to non-sensitive config flags only.
-- Edge functions use the service role and bypass RLS, so they keep full access.
DROP POLICY IF EXISTS "Owner can view secrets" ON public.app_secrets;

CREATE POLICY "Owner can view non-sensitive config"
ON public.app_secrets
FOR SELECT
TO authenticated
USING (
  public.is_owner(auth.uid())
  AND key IN ('OWNER_AI_BYPASS_ENABLED')
);