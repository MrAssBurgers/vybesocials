DROP FUNCTION IF EXISTS public.get_my_profile_private();

CREATE FUNCTION public.get_my_profile_private()
RETURNS TABLE(
  user_id uuid,
  email text,
  phone_number text,
  phone_e164_sha256 text,
  date_of_birth date,
  stripe_customer_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id,
         p.email,
         p.phone_number,
         p.phone_e164_sha256,
         p.date_of_birth,
         p.stripe_customer_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_profile_private() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_private() TO authenticated;

COMMENT ON FUNCTION public.get_my_profile_private() IS
  'Owner-scoped read of sensitive profile columns. Base table column-level SELECT on these fields is revoked from anon/authenticated to prevent platform-wide PII exposure.';