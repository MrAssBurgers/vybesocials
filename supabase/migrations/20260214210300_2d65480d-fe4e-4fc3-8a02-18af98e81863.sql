
DROP FUNCTION IF EXISTS public.track_daily_login();

CREATE OR REPLACE FUNCTION public.track_daily_login()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  
  -- Check last login date for login-type daily challenges
  SELECT DATE(cp.updated_at) INTO v_last_login
  FROM challenge_progress cp
  JOIN challenges c ON c.id = cp.challenge_id
  WHERE cp.user_id = v_profile_id 
  AND c.requirement_type IN ('login', 'daily_login')
  AND c.type = 'daily'
  ORDER BY cp.updated_at DESC
  LIMIT 1;
  
  -- Only credit if hasn't logged in today
  IF v_last_login IS NULL OR v_last_login < CURRENT_DATE THEN
    -- Increment login challenge progress
    PERFORM increment_challenge_progress(v_profile_id, 'login');
    PERFORM increment_challenge_progress(v_profile_id, 'daily_login');
    
    -- Get current streak (after update_login_streak was called)
    SELECT current_streak INTO v_current_streak 
    FROM login_streaks WHERE user_id = v_auth_id;
    v_current_streak := COALESCE(v_current_streak, 1);
    
    -- Calculate XP: base * (1 + 0.3 * (streak - 1))
    -- Day 1: 15, Day 2: 19, Day 3: 24, Day 5: 33, Day 10: 55
    v_multiplier := 1.0 + 0.3 * GREATEST(v_current_streak - 1, 0);
    v_final_xp := CEIL(v_base_xp * v_multiplier);
    
    -- Grant streak-multiplied XP
    SELECT add_user_xp(v_profile_id, v_final_xp) INTO v_level_result;
    
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
$function$;
