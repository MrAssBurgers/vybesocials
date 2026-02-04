-- =====================================================
-- FIX: Drop "Anyone can view roles" policy on user_roles_auth
-- This was missed earlier - the old public policy still exists
-- =====================================================

DROP POLICY IF EXISTS "Anyone can view roles" ON public.user_roles_auth;

-- The "Authenticated can view roles" policy was already created
-- Let's verify and recreate if needed
DROP POLICY IF EXISTS "Authenticated can view roles" ON public.user_roles_auth;

CREATE POLICY "Authenticated can view roles" 
ON public.user_roles_auth 
FOR SELECT 
TO authenticated
USING (true);