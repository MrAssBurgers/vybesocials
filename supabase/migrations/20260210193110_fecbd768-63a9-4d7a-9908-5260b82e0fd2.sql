
-- Fix: Restrict direct SELECT on profiles table to safe columns only
-- This prevents any authenticated user from reading PII (email, phone, DOB, names)

-- 1. Revoke full SELECT from authenticated and anon on profiles
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;

-- 2. Grant SELECT only on non-sensitive columns to authenticated
GRANT SELECT (
  id, user_id, username, avatar_url, bio, created_at, display_name,
  link_url, location, is_private, is_verified, interests, language,
  timezone, coins_balance, onboarding_completed, tutorial_completed,
  tutorial_skipped, intro_completed, badge_settings, referral_inviter_id
) ON public.profiles TO authenticated;

-- 3. Recreate public_profiles view WITHOUT security_invoker
-- This allows the view to run as definer (owner), bypassing column restrictions
-- while still using auth.uid() for PII masking via CASE expressions
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles AS
SELECT
  id,
  user_id,
  username,
  display_name,
  avatar_url,
  bio,
  link_url,
  location,
  is_private,
  is_verified,
  interests,
  language,
  timezone,
  coins_balance,
  created_at,
  onboarding_completed,
  tutorial_completed,
  tutorial_skipped,
  intro_completed,
  badge_settings,
  CASE WHEN (auth.uid() = user_id) THEN email ELSE NULL::text END AS email,
  CASE WHEN (auth.uid() = user_id) THEN phone_number ELSE NULL::text END AS phone_number,
  CASE WHEN (auth.uid() = user_id) THEN phone_verified ELSE NULL::boolean END AS phone_verified,
  CASE WHEN (auth.uid() = user_id) THEN first_name ELSE NULL::text END AS first_name,
  CASE WHEN (auth.uid() = user_id) THEN last_name ELSE NULL::text END AS last_name,
  CASE WHEN (auth.uid() = user_id) THEN date_of_birth ELSE NULL::date END AS date_of_birth,
  CASE WHEN (auth.uid() = user_id) THEN age_verified ELSE NULL::boolean END AS age_verified,
  CASE WHEN (auth.uid() = user_id) THEN sensitivity_preference ELSE NULL::text END AS sensitivity_preference,
  CASE WHEN (auth.uid() = user_id) THEN referral_inviter_id ELSE NULL::uuid END AS referral_inviter_id
FROM profiles;

-- 4. Grant SELECT on the view to authenticated and anon
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;
