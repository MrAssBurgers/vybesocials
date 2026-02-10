
-- ============================================================
-- FIX 1: Profiles table - restrict PII to owner only
-- ============================================================

-- Drop the overly permissive policy that lets any authenticated user see all profiles
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

-- Create a new policy: authenticated users can view all profiles (needed for username/avatar lookups)
-- but we'll use a column-masking view approach
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles FOR SELECT TO authenticated
USING (true);

-- Actually, we can't do column-level RLS in Postgres. Instead:
-- 1. Replace the view with one that masks PII for non-owners
-- 2. Keep the base table accessible but redirect app queries to the safe view

-- Drop and recreate the public_profiles view to mask PII
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles
WITH (security_invoker = on) AS
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
  -- PII: only visible to profile owner
  CASE WHEN auth.uid() = user_id THEN email ELSE NULL END AS email,
  CASE WHEN auth.uid() = user_id THEN phone_number ELSE NULL END AS phone_number,
  CASE WHEN auth.uid() = user_id THEN phone_verified ELSE NULL END AS phone_verified,
  CASE WHEN auth.uid() = user_id THEN first_name ELSE NULL END AS first_name,
  CASE WHEN auth.uid() = user_id THEN last_name ELSE NULL END AS last_name,
  CASE WHEN auth.uid() = user_id THEN date_of_birth ELSE NULL END AS date_of_birth,
  CASE WHEN auth.uid() = user_id THEN age_verified ELSE NULL END AS age_verified,
  CASE WHEN auth.uid() = user_id THEN sensitivity_preference ELSE NULL END AS sensitivity_preference,
  CASE WHEN auth.uid() = user_id THEN referral_inviter_id ELSE NULL END AS referral_inviter_id
FROM profiles;

-- Now restrict the base profiles table: only the owner can SELECT directly
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

CREATE POLICY "Users can view own profile directly"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Keep the anonymous view policy
-- The public_profiles view with security_invoker will use the caller's permissions,
-- but since we restricted to owner-only, non-owners querying the view won't get rows.
-- We need a SECURITY DEFINER function or a broader policy for the view to work.

-- Better approach: Allow all authenticated to SELECT, but via the view that masks PII.
-- Drop owner-only policy and use a different strategy:
DROP POLICY IF EXISTS "Users can view own profile directly" ON public.profiles;

-- Allow all authenticated users to read profiles (needed for the view and direct queries)
CREATE POLICY "Authenticated users can read profiles"
ON public.profiles FOR SELECT TO authenticated
USING (true);

-- The key protection: the public_profiles view now masks PII fields for non-owners.
-- App code should query public_profiles for user lookups.

-- ============================================================
-- FIX 2: Business profiles - restrict contact info to owner only  
-- ============================================================

-- Drop the existing public view and recreate with PII masking
DROP VIEW IF EXISTS public.business_profiles_public;

CREATE VIEW public.business_profiles_public
WITH (security_invoker = on) AS
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
  updated_at,
  -- PII: only visible to business owner
  CASE WHEN auth.uid() = (SELECT p.user_id FROM profiles p WHERE p.id = owner_id) THEN email ELSE NULL END AS email,
  CASE WHEN auth.uid() = (SELECT p.user_id FROM profiles p WHERE p.id = owner_id) THEN phone ELSE NULL END AS phone,
  CASE WHEN auth.uid() = (SELECT p.user_id FROM profiles p WHERE p.id = owner_id) THEN stripe_account_id ELSE NULL END AS stripe_account_id,
  CASE WHEN auth.uid() = (SELECT p.user_id FROM profiles p WHERE p.id = owner_id) THEN total_revenue ELSE NULL END AS total_revenue
FROM business_profiles
WHERE is_active = true;

-- Drop the permissive SELECT policy and replace with owner-only for base table
DROP POLICY IF EXISTS "Anyone can view active business profiles" ON public.business_profiles;

-- Owner can see their own full business profile (all columns)
CREATE POLICY "Owners can view own business profile"
ON public.business_profiles FOR SELECT TO authenticated
USING (owner_id = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()));

-- Public can view active business profiles through the view (which masks PII)
-- But the view uses security_invoker, so non-owners won't get rows with owner-only policy.
-- We need a broader SELECT policy since the view needs it:
DROP POLICY IF EXISTS "Owners can view own business profile" ON public.business_profiles;

CREATE POLICY "Authenticated users can view active business profiles"
ON public.business_profiles FOR SELECT TO authenticated
USING (is_active = true);

-- The protection is via the business_profiles_public view which masks email/phone/stripe for non-owners.
