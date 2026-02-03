-- Drop and recreate functions that need parameter name changes
DROP FUNCTION IF EXISTS public.sync_user_challenge_progress(UUID);
DROP FUNCTION IF EXISTS public.sync_my_challenge_progress();
DROP FUNCTION IF EXISTS public.get_user_primary_badge(UUID);

-- Update grant function to use the correct user_id (auth.users reference)
CREATE OR REPLACE FUNCTION public.grant_owner_all_badges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_auth_id UUID;
  v_badge RECORD;
BEGIN
  -- Find owner's auth user_id (not profile id!)
  SELECT user_id INTO v_owner_auth_id 
  FROM profiles 
  WHERE LOWER(TRIM(username)) = 'mrassburgers' 
    AND user_id IS NOT NULL
  LIMIT 1;
  
  IF v_owner_auth_id IS NULL THEN 
    RAISE NOTICE 'Owner auth user not found';
    RETURN; 
  END IF;
  
  -- Grant all active badges to owner
  FOR v_badge IN SELECT id, name, category FROM badges WHERE is_active = true
  LOOP
    INSERT INTO user_badges (
      user_id, badge_id, badge_type, badge_name, 
      earned_at, show_effect, is_primary
    )
    VALUES (
      v_owner_auth_id, v_badge.id, v_badge.category::text, v_badge.name,
      NOW(), true, 
      CASE WHEN v_badge.category::text = 'role' AND v_badge.name = 'Owner' THEN true ELSE false END
    )
    ON CONFLICT (user_id, badge_id) DO NOTHING;
  END LOOP;
END;
$$;

-- Recreate sync_user_challenge_progress with auth user_id
CREATE FUNCTION public.sync_user_challenge_progress(p_auth_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge RECORD;
  v_current_count INTEGER;
  v_profile_id UUID;
BEGIN
  -- Get the profile id for this auth user
  SELECT id INTO v_profile_id 
  FROM profiles 
  WHERE user_id = p_auth_user_id;
  
  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_challenge IN 
    SELECT c.*, b.name as badge_name, b.category as badge_category
    FROM challenges c
    LEFT JOIN badges b ON c.reward_badge_id = b.id
    WHERE c.is_active = true
  LOOP
    CASE v_challenge.requirement_type
      WHEN 'posts' THEN
        SELECT COUNT(*) INTO v_current_count FROM posts WHERE user_id = v_profile_id;
      WHEN 'friends' THEN
        SELECT COUNT(*) INTO v_current_count FROM friends 
        WHERE (user_id = v_profile_id OR friend_id = v_profile_id) AND status = 'accepted';
      WHEN 'messages' THEN
        SELECT COUNT(*) INTO v_current_count FROM messages WHERE sender_id = v_profile_id;
      WHEN 'likes' THEN
        SELECT COUNT(*) INTO v_current_count FROM likes WHERE user_id = v_profile_id;
      WHEN 'comments' THEN
        SELECT COUNT(*) INTO v_current_count FROM comments WHERE user_id = v_profile_id;
      WHEN 'referrals' THEN
        SELECT COALESCE(referral_count, 0) INTO v_current_count FROM profiles WHERE id = v_profile_id;
      WHEN 'streak' THEN
        SELECT COALESCE(MAX(streak_count), 0) INTO v_current_count FROM streaks WHERE user_id = v_profile_id;
      ELSE
        v_current_count := 0;
    END CASE;
    
    INSERT INTO challenge_progress (user_id, challenge_id, current_count, is_completed, completed_at)
    VALUES (
      v_profile_id, v_challenge.id, v_current_count,
      v_current_count >= COALESCE(v_challenge.requirement_count, 1),
      CASE WHEN v_current_count >= COALESCE(v_challenge.requirement_count, 1) THEN NOW() ELSE NULL END
    )
    ON CONFLICT (user_id, challenge_id) 
    DO UPDATE SET
      current_count = EXCLUDED.current_count,
      is_completed = EXCLUDED.is_completed,
      completed_at = COALESCE(challenge_progress.completed_at, EXCLUDED.completed_at),
      updated_at = NOW();
    
    IF v_current_count >= COALESCE(v_challenge.requirement_count, 1) AND v_challenge.reward_badge_id IS NOT NULL THEN
      INSERT INTO user_badges (user_id, badge_id, badge_type, badge_name, earned_at, show_effect)
      VALUES (
        p_auth_user_id,
        v_challenge.reward_badge_id, 
        COALESCE(v_challenge.badge_category::text, 'achievement'),
        COALESCE(v_challenge.badge_name, 'Achievement'),
        NOW(), true
      )
      ON CONFLICT (user_id, badge_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Recreate sync_my_challenge_progress
CREATE FUNCTION public.sync_my_challenge_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  PERFORM sync_user_challenge_progress(auth.uid());
END;
$$;

-- Update check_and_grant_owner_badges wrapper
CREATE OR REPLACE FUNCTION public.check_and_grant_owner_badges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM grant_owner_all_badges();
END;
$$;

-- Recreate get_user_primary_badge to handle both profile_id and auth_user_id lookups
CREATE FUNCTION public.get_user_primary_badge(p_user_id UUID)
RETURNS TABLE (
  badge_id UUID,
  name TEXT,
  icon TEXT,
  category TEXT,
  priority INTEGER,
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
  -- First check if p_user_id is a profile id and get the auth user_id
  SELECT profiles.user_id INTO v_auth_user_id 
  FROM profiles 
  WHERE profiles.id = p_user_id;
  
  -- If not found as profile, assume p_user_id IS the auth user_id
  IF v_auth_user_id IS NULL THEN
    v_auth_user_id := p_user_id;
  END IF;
  
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.icon,
    b.category::text,
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
  ORDER BY b.priority ASC
  LIMIT 1;
END;
$$;

-- Now grant badges to the owner immediately
DO $$
DECLARE
  v_owner_auth_id UUID;
  v_badge RECORD;
BEGIN
  SELECT user_id INTO v_owner_auth_id 
  FROM profiles 
  WHERE LOWER(TRIM(username)) = 'mrassburgers' 
    AND user_id IS NOT NULL
  LIMIT 1;
  
  IF v_owner_auth_id IS NOT NULL THEN
    FOR v_badge IN SELECT id, name, category FROM badges WHERE is_active = true
    LOOP
      INSERT INTO user_badges (
        user_id, badge_id, badge_type, badge_name, 
        earned_at, show_effect, is_primary
      )
      VALUES (
        v_owner_auth_id, v_badge.id, v_badge.category::text, v_badge.name,
        NOW(), true, 
        CASE WHEN v_badge.category::text = 'role' AND v_badge.name = 'Owner' THEN true ELSE false END
      )
      ON CONFLICT (user_id, badge_id) DO NOTHING;
    END LOOP;
  END IF;
END;
$$;