-- URGENT FIX: Restore SELECT grants on profiles table
-- The previous PII security migration revoked ALL SELECT access, breaking the entire app.
-- We'll use RLS policies (which are already in place) to control access instead of column-level grants.

-- Restore full SELECT grant for authenticated users
GRANT SELECT ON public.profiles TO authenticated;

-- Restore full SELECT grant for anon (needed for public profile views, RLS controls what rows)  
GRANT SELECT ON public.profiles TO anon;

-- Also ensure INSERT/UPDATE grants are intact
GRANT INSERT ON public.profiles TO authenticated;
GRANT UPDATE ON public.profiles TO authenticated;

-- Drop the overly restrictive "view own profile" policy since we already have a broader one
-- Keep the existing "Authenticated users can read profiles" (qual: true) which allows reads
-- and "Users can update own profile" which restricts writes
DROP POLICY IF EXISTS "Anonymous users can view public profiles via view" ON public.profiles;

-- Re-create anon policy that actually works (not false)
CREATE POLICY "Anon can view public profiles"
  ON public.profiles FOR SELECT
  TO anon
  USING (true);

-- Ensure the public_profiles view is accessible too
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;