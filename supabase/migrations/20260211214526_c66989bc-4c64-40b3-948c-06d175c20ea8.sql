
-- Revoke full SELECT on profiles from authenticated and anon
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;

-- Grant SELECT only on non-sensitive columns to authenticated
GRANT SELECT (
  id, user_id, username, avatar_url, bio, display_name,
  link_url, location, is_private, is_verified, interests,
  language, timezone, coins_balance, created_at,
  onboarding_completed, tutorial_completed, tutorial_skipped,
  intro_completed, badge_settings
) ON public.profiles TO authenticated;

-- Anon gets even less - just public display fields
GRANT SELECT (
  id, user_id, username, avatar_url, bio, display_name,
  link_url, location, is_private, is_verified, interests,
  created_at
) ON public.profiles TO anon;

-- Owners still need full access to their own row for INSERT/UPDATE
-- (existing INSERT/UPDATE policies already restrict to own row via auth.uid() = user_id)
-- Grant all columns for INSERT and UPDATE (already restricted by RLS)
GRANT INSERT ON public.profiles TO authenticated;
GRANT UPDATE ON public.profiles TO authenticated;
