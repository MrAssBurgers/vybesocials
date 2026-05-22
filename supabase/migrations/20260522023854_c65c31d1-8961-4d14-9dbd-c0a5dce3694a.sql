-- Revoke column-level SELECT on sensitive PII from public/authenticated/anon roles.
-- Service role and the SECURITY DEFINER RPC (get_own_sensitive_profile) retain access.
REVOKE SELECT (email, phone_number, stripe_customer_id) ON public.profiles FROM PUBLIC;
REVOKE SELECT (email, phone_number, stripe_customer_id) ON public.profiles FROM anon;
REVOKE SELECT (email, phone_number, stripe_customer_id) ON public.profiles FROM authenticated;

-- Owner-readable column set — grant SELECT on the remaining (non-sensitive) columns
-- to authenticated so existing queries continue working.
GRANT SELECT (
  id, user_id, username, display_name, avatar_url, bio, link_url, location,
  is_private, is_verified, interests, language, timezone, coins_balance,
  onboarding_completed, tutorial_completed, tutorial_skipped, intro_completed,
  badge_settings, date_of_birth, feature_on_landing, created_at, updated_at,
  phone_verified, tracking_consent, crash_consent
) ON public.profiles TO authenticated;

-- Allow contact discovery without exposing phone numbers to clients.
-- Caller passes a list of normalized phone numbers; we return only matched
-- public profile fields (never the phone itself).
CREATE OR REPLACE FUNCTION public.discover_users_by_phone(_phones text[])
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.phone_verified = true
    AND p.phone_number = ANY(_phones)
    AND p.user_id <> auth.uid();
$$;

REVOKE ALL ON FUNCTION public.discover_users_by_phone(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discover_users_by_phone(text[]) TO authenticated;