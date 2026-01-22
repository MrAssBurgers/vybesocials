-- =====================================================
-- CRITICAL PROFILE SYSTEM REPAIR
-- Fixes: RLS policies, profile creation, profile viewing, referrals
-- =====================================================

-- 1. DROP EXISTING PROBLEMATIC POLICIES (they're too restrictive)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view public profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- 2. CREATE COMPREHENSIVE RLS POLICIES FOR PROFILES

-- Anyone authenticated can view all profiles (public by default)
-- Private profiles are still shown but with limited info in app logic
CREATE POLICY "Authenticated users can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Anon users can view public profiles (for invite link previews)
CREATE POLICY "Anonymous users can view public profiles"
ON public.profiles
FOR SELECT
TO anon
USING ((is_private IS NOT TRUE) OR (is_private IS NULL));

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 3. CREATE OR REPLACE ensure_profile FUNCTION (more robust)
CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _auth_user_id uuid;
  _profile_id uuid;
  _username text;
  _retry_count int := 0;
  _max_retries int := 3;
BEGIN
  _auth_user_id := auth.uid();
  
  IF _auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- First, try to find existing profile
  SELECT id INTO _profile_id
  FROM public.profiles
  WHERE user_id = _auth_user_id
  LIMIT 1;

  IF _profile_id IS NOT NULL THEN
    RETURN _profile_id;
  END IF;

  -- Generate unique username with retries for collision handling
  WHILE _retry_count < _max_retries LOOP
    BEGIN
      IF _retry_count = 0 THEN
        _username := 'user_' || substring(replace(_auth_user_id::text, '-', ''), 1, 12);
      ELSE
        _username := 'user_' || substring(replace(_auth_user_id::text, '-', ''), 1, 8) || '_' || _retry_count::text;
      END IF;

      INSERT INTO public.profiles (user_id, username, bio)
      VALUES (_auth_user_id, _username, '')
      ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id INTO _profile_id;

      RETURN _profile_id;
    EXCEPTION WHEN unique_violation THEN
      _retry_count := _retry_count + 1;
      IF _retry_count >= _max_retries THEN
        -- Final fallback with timestamp
        _username := 'user_' || extract(epoch from now())::bigint::text;
        INSERT INTO public.profiles (user_id, username, bio)
        VALUES (_auth_user_id, _username, '')
        ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING id INTO _profile_id;
        RETURN _profile_id;
      END IF;
    END;
  END LOOP;

  -- Should never reach here, but return null as safety
  RETURN NULL;
END;
$$;

-- 4. CREATE get_profile_by_username FUNCTION (bypasses RLS for lookups)
CREATE OR REPLACE FUNCTION public.get_profile_by_username(target_username text)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  is_private boolean,
  is_verified boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.is_private,
    p.is_verified,
    p.created_at
  FROM public.profiles p
  WHERE LOWER(p.username) = LOWER(target_username)
  LIMIT 1;
END;
$$;

-- 5. CREATE get_profile_by_id FUNCTION (bypasses RLS for lookups)
CREATE OR REPLACE FUNCTION public.get_profile_by_id(target_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  is_private boolean,
  is_verified boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.is_private,
    p.is_verified,
    p.created_at
  FROM public.profiles p
  WHERE p.id = target_id
  LIMIT 1;
END;
$$;

-- 6. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.ensure_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_username(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_profile_by_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_id(uuid) TO anon;

-- 7. Fix public_profiles view to have proper RLS bypass
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = false)
AS
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

GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;