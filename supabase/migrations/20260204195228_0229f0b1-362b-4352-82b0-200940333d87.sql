-- =====================================================
-- FIX 1: Fix infinite recursion in user_roles_auth policy
-- =====================================================

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles_auth;

-- Create a SECURITY DEFINER function to check admin status without triggering RLS
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles_auth
    WHERE user_id = _user_id AND role = 'admin'::app_role
  )
$$;

-- Create new admin management policy using the security definer function
CREATE POLICY "Admins can manage roles" 
ON public.user_roles_auth 
FOR ALL 
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- =====================================================
-- FIX 2: Restrict user_presence to authenticated only
-- =====================================================

-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Anyone can view presence" ON public.user_presence;

-- Create new policy that only allows authenticated users to view presence
CREATE POLICY "Authenticated users can view presence" 
ON public.user_presence 
FOR SELECT 
TO authenticated
USING (true);

-- =====================================================
-- FIX 3: Update public_profiles view to exclude PII
-- =====================================================

-- Drop and recreate the public_profiles view without sensitive data
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
  first_name,
  onboarding_completed,
  tutorial_completed,
  tutorial_skipped,
  intro_completed,
  badge_settings
  -- Excludes: email, phone_number, phone_verified, date_of_birth, age_verified, 
  -- sensitivity_preference, referral_inviter_id, last_name (PII)
FROM public.profiles;

-- Grant SELECT on the view to authenticated users
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;