
-- Restore table-level grants for business_profiles so RLS policies can function
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_profiles TO authenticated;
GRANT SELECT ON public.business_profiles TO anon;

-- Also fix the SELECT policy to let owners see their own business even if inactive
DROP POLICY IF EXISTS "Authenticated users can view active business profiles" ON public.business_profiles;
CREATE POLICY "Authenticated users can view business profiles"
  ON public.business_profiles FOR SELECT
  TO authenticated
  USING (
    is_active = true 
    OR owner_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Anon users can view active business profiles"
  ON public.business_profiles FOR SELECT
  TO anon
  USING (is_active = true);
