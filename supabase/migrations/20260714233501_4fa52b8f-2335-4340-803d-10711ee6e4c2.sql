
-- 1) external_account_handles: restrict SELECT to owner only
DROP POLICY IF EXISTS "anyone read external handles" ON public.external_account_handles;
CREATE POLICY "owner read external handles"
  ON public.external_account_handles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2) storage.objects: remove overly-broad INSERT policies for media/sounds buckets.
--    Owner-folder-scoped INSERT policies remain in place.
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload sounds" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own sounds" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own custom sounds" ON storage.objects;

-- Ensure a strict owner-folder INSERT policy exists for sounds (media already has one)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Auth users upload sounds'
  ) THEN
    CREATE POLICY "Auth users upload sounds"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'sounds'
        AND (auth.uid())::text = (storage.foldername(name))[1]
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Auth users upload custom sounds'
  ) THEN
    CREATE POLICY "Auth users upload custom sounds"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'custom-sounds'
        AND (auth.uid())::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;

-- 3) profiles: ensure sensitive PII columns are not readable by anon/authenticated.
--    RLS cannot restrict columns, so use column-level privilege revocation.
REVOKE SELECT (email, phone_number, phone_verified, date_of_birth, stripe_customer_id)
  ON public.profiles FROM anon, authenticated, PUBLIC;

-- Provide an owner-only accessor for self sensitive fields
CREATE OR REPLACE FUNCTION public.get_my_profile_sensitive()
RETURNS TABLE (
  email text,
  phone_number text,
  phone_verified boolean,
  date_of_birth date,
  stripe_customer_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email, p.phone_number, p.phone_verified, p.date_of_birth, p.stripe_customer_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_profile_sensitive() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_sensitive() TO authenticated;
