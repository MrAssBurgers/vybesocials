-- Fix the public_profiles view - remove security_invoker so it can read from profiles
-- This allows the view to act as a security barrier, only exposing public fields

DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles AS
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

-- Grant select on the view to everyone
GRANT SELECT ON public.public_profiles TO authenticated, anon, public;