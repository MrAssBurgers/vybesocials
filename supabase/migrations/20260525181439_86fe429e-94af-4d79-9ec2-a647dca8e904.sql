-- Revoke column-level SELECT for sensitive PII from authenticated/anon roles.
-- Service role (used by edge functions) retains access.
REVOKE SELECT (email, phone_number, stripe_customer_id, phone_e164_sha256)
  ON public.profiles FROM authenticated;
REVOKE SELECT (email, phone_number, stripe_customer_id, phone_e164_sha256)
  ON public.profiles FROM anon;

-- Owner-scoped helper so users can still read their own private fields.
CREATE OR REPLACE FUNCTION public.get_my_private_profile()
RETURNS TABLE (
  email text,
  phone_number text,
  phone_verified boolean,
  stripe_customer_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email, p.phone_number, p.phone_verified, p.stripe_customer_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_private_profile() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_private_profile() TO authenticated;