-- Fix the owner's profile to link user_id to auth ID
-- First, get the correct auth user ID for the owner
UPDATE profiles
SET user_id = (
  SELECT id FROM auth.users 
  WHERE email ILIKE '%mrassburgers%' 
  OR raw_user_meta_data->>'username' ILIKE 'mrassburgers'
  LIMIT 1
)
WHERE LOWER(TRIM(username)) = 'mrassburgers' AND user_id IS NULL;

-- Update get_user_primary_badge to resolve profile ID → auth user_id → badges
CREATE OR REPLACE FUNCTION public.get_user_primary_badge(p_user_id UUID)
RETURNS TABLE(
  badge_id UUID,
  name TEXT,
  icon TEXT,
  category TEXT,
  priority INT,
  gradient_from TEXT,
  gradient_to TEXT,
  gradient_via TEXT,
  effect TEXT,
  is_animated BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- First, try to get the auth user_id from the profiles table
  -- The p_user_id might be a profile.id, so we need to look up the linked user_id
  SELECT COALESCE(p.user_id, p.id) INTO v_auth_user_id
  FROM profiles p
  WHERE p.id = p_user_id;
  
  -- If no profile found, assume p_user_id is already an auth user id
  IF v_auth_user_id IS NULL THEN
    v_auth_user_id := p_user_id;
  END IF;
  
  -- Return the highest priority active badge for this user
  RETURN QUERY
  SELECT 
    b.id as badge_id,
    b.name,
    b.icon,
    b.category::TEXT,
    b.priority,
    b.gradient_from,
    b.gradient_to,
    b.gradient_via,
    b.effect,
    b.is_animated
  FROM user_badges ub
  JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = v_auth_user_id
    AND b.is_active = true
    AND (ub.expires_at IS NULL OR ub.expires_at > NOW())
    AND ub.show_effect = true
  ORDER BY b.priority ASC
  LIMIT 1;
END;
$$;

-- Also update useUserBadges to work correctly - create a function that returns badges for a profile
CREATE OR REPLACE FUNCTION public.get_user_badges_by_profile(p_profile_id UUID)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  badge_id UUID,
  is_pinned BOOLEAN,
  pin_order INT,
  is_primary BOOLEAN,
  show_effect BOOLEAN,
  earned_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  badge_name TEXT,
  badge_description TEXT,
  badge_icon TEXT,
  badge_category TEXT,
  badge_priority INT,
  badge_gradient_from TEXT,
  badge_gradient_to TEXT,
  badge_gradient_via TEXT,
  badge_effect TEXT,
  badge_is_animated BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- Get the auth user_id from the profiles table
  SELECT COALESCE(p.user_id, p.id) INTO v_auth_user_id
  FROM profiles p
  WHERE p.id = p_profile_id;
  
  IF v_auth_user_id IS NULL THEN
    v_auth_user_id := p_profile_id;
  END IF;
  
  RETURN QUERY
  SELECT 
    ub.id,
    ub.user_id,
    ub.badge_id,
    ub.is_pinned,
    ub.pin_order,
    ub.is_primary,
    ub.show_effect,
    ub.earned_at,
    ub.expires_at,
    b.name as badge_name,
    b.description as badge_description,
    b.icon as badge_icon,
    b.category::TEXT as badge_category,
    b.priority as badge_priority,
    b.gradient_from as badge_gradient_from,
    b.gradient_to as badge_gradient_to,
    b.gradient_via as badge_gradient_via,
    b.effect as badge_effect,
    b.is_animated as badge_is_animated
  FROM user_badges ub
  JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = v_auth_user_id
    AND (ub.expires_at IS NULL OR ub.expires_at > NOW())
  ORDER BY b.priority ASC;
END;
$$;