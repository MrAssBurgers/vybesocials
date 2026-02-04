-- =====================================================
-- FIX: Clean up duplicate/overly permissive invite policies
-- =====================================================

-- Drop all the overly permissive policies
DROP POLICY IF EXISTS "Anyone can view invite by code" ON public.invites;
DROP POLICY IF EXISTS "Users can view their own invites" ON public.invites;
DROP POLICY IF EXISTS "Users can create their own invites" ON public.invites;

-- Create proper INSERT policy with user check
CREATE POLICY "Authenticated users can create invites" 
ON public.invites 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = inviter_id);

-- =====================================================
-- FIX: Restrict profiles base table access
-- =====================================================

-- Anon users should only access via public_profiles view (already set)
-- Update the "Authenticated users can view profiles" to be more restrictive
-- Keep full profile access for authenticated (needed for DMs, friend lists)
-- but the public_profiles view excludes PII

-- No change needed here - the public_profiles view already protects PII
-- The base profiles policy allows auth users to see usernames/avatars for social features

-- =====================================================
-- FIX: Fix functions with mutable search_path
-- =====================================================

-- Update current_profile_id to have proper search_path
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- Update has_role to have proper search_path (already has it, but ensure)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles_auth
    WHERE user_id = _user_id AND role = _role
  )
$$;