-- Drop the broken owner-only SELECT policy
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Restore authenticated read access for all profiles (social app)
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Ensure anon users still cannot read profiles
DROP POLICY IF EXISTS "Anon users cannot view profiles" ON public.profiles;
CREATE POLICY "Anon users cannot view profiles"
ON public.profiles
FOR SELECT
TO anon
USING (false);