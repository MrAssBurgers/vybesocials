
CREATE OR REPLACE FUNCTION public.award_badge(p_user_id uuid, p_badge_id uuid, p_awarded_by uuid DEFAULT NULL, p_expires_at timestamptz DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_target_auth_id UUID;
  v_badge RECORD;
  v_caller_auth_id UUID;
  v_owner_auth_id UUID;
  v_wife_auth_id UUID;
  v_result_id UUID;
BEGIN
  v_caller_auth_id := auth.uid();
  
  -- Resolve target to auth user id
  v_target_auth_id := public.get_auth_id_for_profile(p_user_id);
  
  IF v_target_auth_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Get badge info
  SELECT * INTO v_badge FROM public.badges WHERE id = p_badge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Badge not found';
  END IF;
  
  -- Get exclusive user IDs
  v_owner_auth_id := public.get_owner_auth_id();
  v_wife_auth_id := public.get_owner_wife_auth_id();
  
  -- Enforce exclusivity for Owner badge
  IF v_badge.name = 'Owner' OR (v_badge.category = 'role' AND v_badge.priority = 1) THEN
    IF v_target_auth_id != v_owner_auth_id THEN
      RAISE EXCEPTION 'Owner badge is exclusive to the app owner';
    END IF;
  END IF;
  
  -- Enforce exclusivity for Owner's Wife badge
  IF v_badge.name = 'Owner''s Wife' THEN
    IF v_target_auth_id != v_wife_auth_id THEN
      RAISE EXCEPTION 'This badge is exclusive';
    END IF;
  END IF;
  
  -- Permission check: admins, moderators, and owner can award badges to others
  IF v_caller_auth_id IS NOT NULL AND v_caller_auth_id != v_target_auth_id THEN
    IF NOT (
      public.has_role(v_caller_auth_id, 'admin') 
      OR public.has_role(v_caller_auth_id, 'moderator')
      OR v_caller_auth_id = v_owner_auth_id
    ) THEN
      RAISE EXCEPTION 'Only admins and moderators can award badges to others';
    END IF;
  END IF;
  
  -- Insert the badge
  INSERT INTO public.user_badges (user_id, badge_id, awarded_by, expires_at)
  VALUES (v_target_auth_id, p_badge_id, p_awarded_by, p_expires_at)
  ON CONFLICT (user_id, badge_id) DO UPDATE SET
    expires_at = COALESCE(EXCLUDED.expires_at, user_badges.expires_at),
    awarded_by = COALESCE(EXCLUDED.awarded_by, user_badges.awarded_by)
  RETURNING id INTO v_result_id;
  
  RETURN v_result_id;
END;
$$;
