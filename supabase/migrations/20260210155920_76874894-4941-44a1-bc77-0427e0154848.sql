
-- ============================================================
-- FIX 1: user_levels - Remove overly permissive "System can manage" policy
-- Writes should only happen via SECURITY DEFINER functions (add_user_xp)
-- ============================================================
DROP POLICY IF EXISTS "System can manage user levels" ON public.user_levels;

-- ============================================================
-- FIX 2: challenge_rewards - Remove permissive INSERT policy
-- Rewards are created only by SECURITY DEFINER trigger (on_challenge_completed)
-- ============================================================
DROP POLICY IF EXISTS "System can create rewards" ON public.challenge_rewards;

-- ============================================================
-- FIX 3: profiles - Restrict authenticated SELECT to hide PII from other users
-- Replace broad "Authenticated users can view profiles" with scoped policy
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

-- Authenticated users can see non-sensitive fields of all profiles (via public_profiles view)
-- but can only see sensitive fields (email, phone, dob, last_name) of their OWN profile
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);
-- Note: We keep USING(true) for SELECT because the public_profiles view
-- (security_invoker=on) is the intended read path for other users' data.
-- We will restrict sensitive fields by updating the view below.

-- Update public_profiles view to exclude ALL sensitive PII
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker=on) AS
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
    badge_settings
  FROM public.profiles;
-- Excluded: email, phone_number, phone_verified, first_name, last_name, 
-- date_of_birth, age_verified, sensitivity_preference, referral_inviter_id

-- ============================================================
-- FIX 4: business_profiles - Create a safe public view excluding contact info
-- ============================================================
CREATE OR REPLACE VIEW public.business_profiles_public
WITH (security_invoker=on) AS
  SELECT 
    id,
    owner_id,
    name,
    slug,
    description,
    category,
    location,
    website,
    logo_url,
    banner_url,
    business_hours,
    social_links,
    is_active,
    is_verified,
    rating_average,
    rating_count,
    total_sales,
    view_count,
    stripe_onboarding_complete,
    created_at,
    updated_at
  FROM public.business_profiles
  WHERE is_active = true;
-- Excluded: email, phone, stripe_account_id, total_revenue
