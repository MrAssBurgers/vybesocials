-- Revoke column-level SELECT on sensitive PII columns from anon and authenticated so that
-- broadly-permissive RLS on profiles no longer exposes contact PII / billing identifiers.
REVOKE SELECT (email, phone_number, phone_e164_sha256, date_of_birth, stripe_customer_id)
  ON public.profiles FROM anon, authenticated;

-- Owner-only view exposing sensitive columns for the currently-authenticated user's own row.
-- Uses SECURITY DEFINER semantics (default view behaviour) so column-level revokes on the
-- base table do not block reads through this restricted view.
CREATE OR REPLACE VIEW public.my_profile_private AS
SELECT user_id,
       email,
       phone_number,
       phone_e164_sha256,
       date_of_birth,
       stripe_customer_id
FROM public.profiles
WHERE user_id = auth.uid();

REVOKE ALL ON public.my_profile_private FROM PUBLIC, anon;
GRANT SELECT ON public.my_profile_private TO authenticated;

COMMENT ON VIEW public.my_profile_private IS
  'Owner-scoped view of sensitive profile columns. Base table column-level SELECT on these fields is revoked from anon/authenticated to prevent platform-wide PII exposure.';