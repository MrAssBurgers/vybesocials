
-- FIX 1: public_profiles view — set security_invoker so auth.uid() runs as the querying user
-- This prevents PII leaking to unauthorized users
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = on)
AS
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
  CASE WHEN (auth.uid() = user_id) THEN email ELSE NULL END AS email,
  CASE WHEN (auth.uid() = user_id) THEN phone_number ELSE NULL END AS phone_number,
  CASE WHEN (auth.uid() = user_id) THEN phone_verified ELSE NULL END AS phone_verified,
  CASE WHEN (auth.uid() = user_id) THEN first_name ELSE NULL END AS first_name,
  CASE WHEN (auth.uid() = user_id) THEN last_name ELSE NULL END AS last_name,
  CASE WHEN (auth.uid() = user_id) THEN date_of_birth ELSE NULL END AS date_of_birth,
  CASE WHEN (auth.uid() = user_id) THEN age_verified ELSE NULL END AS age_verified,
  CASE WHEN (auth.uid() = user_id) THEN sensitivity_preference ELSE NULL END AS sensitivity_preference,
  CASE WHEN (auth.uid() = user_id) THEN referral_inviter_id ELSE NULL END AS referral_inviter_id
FROM profiles;

-- Grant access
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;

-- FIX 2: public_sponsor_profiles — strip contact_email, only show safe public fields
DROP VIEW IF EXISTS public.public_sponsor_profiles;
CREATE VIEW public.public_sponsor_profiles
WITH (security_invoker = on)
AS
SELECT 
  id,
  user_id,
  company_name,
  company_logo,
  website_url,
  description,
  is_verified,
  verification_date,
  created_at,
  updated_at
FROM sponsor_profiles;

GRANT SELECT ON public.public_sponsor_profiles TO authenticated;
GRANT SELECT ON public.public_sponsor_profiles TO anon;
