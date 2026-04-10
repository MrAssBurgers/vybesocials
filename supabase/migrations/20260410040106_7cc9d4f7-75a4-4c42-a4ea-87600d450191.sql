-- Drop ALL overloads of add_user_xp to avoid return-type conflicts
DROP FUNCTION IF EXISTS public.add_user_xp(uuid, integer);
DROP FUNCTION IF EXISTS public.add_user_xp(uuid, integer, text);

-- Recreate 2-arg version targeting user_levels, returning jsonb
CREATE OR REPLACE FUNCTION public.add_user_xp(p_user_id uuid, p_xp integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  INSERT INTO public.user_levels (user_id, total_xp, current_level)
  VALUES (p_user_id, p_xp, 1)
  ON CONFLICT (user_id)
  DO UPDATE SET total_xp = user_levels.total_xp + p_xp, updated_at = now();

  SELECT jsonb_build_object('success', true, 'xp_added', p_xp) INTO v_result;
  RETURN v_result;
END;
$$;

-- Recreate 3-arg version (with source) targeting user_levels, returning jsonb
CREATE OR REPLACE FUNCTION public.add_user_xp(p_user_id uuid, p_xp integer, p_source text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  INSERT INTO public.user_levels (user_id, total_xp, current_level)
  VALUES (p_user_id, p_xp, 1)
  ON CONFLICT (user_id)
  DO UPDATE SET total_xp = user_levels.total_xp + p_xp, updated_at = now();

  SELECT jsonb_build_object('success', true, 'xp_added', p_xp, 'source', p_source) INTO v_result;
  RETURN v_result;
END;
$$;

-- Fix track_daily_login to pass auth user ID (not profile ID) to add_user_xp
-- because user_levels.user_id references auth.users(id)
CREATE OR REPLACE FUNCTION public.track_daily_login()
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_auth_id uuid;
  v_profile_id uuid;
  v_last_login date;
  v_current_streak integer;
  v_base_xp integer := 15;
  v_multiplier numeric;
  v_final_xp integer;
  v_level_result jsonb;
BEGIN
  v_auth_id := auth.uid();
  IF v_auth_id IS NULL THEN 
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT id INTO v_profile_id FROM profiles WHERE user_id = v_auth_id;
  IF v_profile_id IS NULL THEN 
    RETURN json_build_object('success', false, 'error', 'No profile');
  END IF;
  
  SELECT DATE(cp.updated_at) INTO v_last_login
  FROM challenge_progress cp
  JOIN challenges c ON c.id = cp.challenge_id
  WHERE cp.user_id = v_profile_id 
  AND c.requirement_type IN ('login', 'daily_login')
  AND c.type = 'daily'
  ORDER BY cp.updated_at DESC
  LIMIT 1;
  
  IF v_last_login IS NULL OR v_last_login < CURRENT_DATE THEN
    PERFORM increment_challenge_progress(v_profile_id, 'login');
    PERFORM increment_challenge_progress(v_profile_id, 'daily_login');
    
    SELECT current_streak INTO v_current_streak 
    FROM login_streaks WHERE user_id = v_auth_id;
    v_current_streak := COALESCE(v_current_streak, 1);
    
    v_multiplier := 1.0 + 0.3 * GREATEST(v_current_streak - 1, 0);
    v_final_xp := CEIL(v_base_xp * v_multiplier);
    
    -- FIX: pass v_auth_id instead of v_profile_id
    SELECT add_user_xp(v_auth_id, v_final_xp) INTO v_level_result;
    
    RETURN json_build_object(
      'success', true,
      'xp_granted', v_final_xp,
      'base_xp', v_base_xp,
      'streak', v_current_streak,
      'multiplier', round(v_multiplier::numeric, 1),
      'level_result', v_level_result
    );
  END IF;
  
  RETURN json_build_object('success', true, 'already_logged', true);
END;
$$;