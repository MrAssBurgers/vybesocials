-- Fix 1: Remove overly permissive profile SELECT policy and restrict direct table access
-- The public_profiles view already exists with safe fields, so we'll restrict the base table

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can view public profile data" ON public.profiles;

-- Create a policy that only allows users to see their own full profile
CREATE POLICY "Users can view own full profile"
ON public.profiles
FOR SELECT
USING (user_id = auth.uid());

-- Ensure the public_profiles view has security_invoker enabled
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
  is_private,
  is_verified,
  link_url,
  created_at
FROM public.profiles;

-- Grant select on the view to authenticated and anon users
GRANT SELECT ON public.public_profiles TO authenticated, anon;