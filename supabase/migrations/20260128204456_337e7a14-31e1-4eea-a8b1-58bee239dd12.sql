-- Fix: Profiles email/phone exposure issue
-- Create a public_profiles view that excludes sensitive fields

-- First, drop existing public_profiles view if it exists
DROP VIEW IF EXISTS public.public_profiles;

-- Create a safe public view that excludes sensitive fields
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
    first_name,
    last_name,
    onboarding_completed,
    tutorial_completed,
    tutorial_skipped,
    intro_completed
    -- Explicitly excludes: email, phone_number, phone_verified, sensitivity_preference, referral_inviter_id
  FROM public.profiles;

-- Grant SELECT on the view to authenticated and anon users
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;

-- Update the "Authenticated users can view all profiles" policy to restrict to own profile only
-- This ensures direct table access only works for the user's own profile
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;

-- Create new restrictive policy - users can only SELECT their own row
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Update anonymous policy to also use the view for public data
DROP POLICY IF EXISTS "Anonymous users can view public profiles" ON public.profiles;
CREATE POLICY "Anonymous users can view public profiles via view"
  ON public.profiles FOR SELECT
  TO anon
  USING (false); -- Anon users should use the public_profiles view

-- Create a SECURITY DEFINER function for safe profile lookups
-- This ensures only safe fields are returned
CREATE OR REPLACE FUNCTION public.get_public_profile_by_id(target_id uuid)
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  is_private boolean,
  is_verified boolean,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.is_private,
    p.is_verified,
    p.created_at
  FROM public.profiles p
  WHERE p.id = target_id
    AND (p.is_private IS NOT TRUE OR p.is_private IS NULL)
  LIMIT 1;
END;
$$;

-- Create function for looking up profiles for friends (allows more fields)
CREATE OR REPLACE FUNCTION public.get_friend_profile_by_id(target_id uuid, current_user_profile_id uuid)
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  is_private boolean,
  is_verified boolean,
  location text,
  link_url text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  are_friends boolean;
BEGIN
  -- Check if users are friends
  SELECT EXISTS (
    SELECT 1 FROM public.friend_requests fr
    WHERE fr.status = 'accepted'
      AND ((fr.sender_id = current_user_profile_id AND fr.receiver_id = target_id)
           OR (fr.sender_id = target_id AND fr.receiver_id = current_user_profile_id))
  ) INTO are_friends;
  
  IF NOT are_friends THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.is_private,
    p.is_verified,
    p.location,
    p.link_url,
    p.created_at
  FROM public.profiles p
  WHERE p.id = target_id
  LIMIT 1;
END;
$$;