
-- Re-add profiles SELECT for authenticated users to prevent breaking 60+ queries
-- The public_profiles view provides the properly masked interface
CREATE POLICY "Authenticated users can read profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
