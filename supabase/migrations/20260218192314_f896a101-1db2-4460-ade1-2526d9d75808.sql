-- Update streak functions: streak starts at 0 on first day, becomes 1 on 2nd consecutive day

CREATE OR REPLACE FUNCTION public.update_login_streak(p_timezone TEXT DEFAULT 'UTC')
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_streak RECORD;
  v_today DATE;
  v_yesterday DATE;
  v_new_streak INTEGER;
  v_was_extended BOOLEAN := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  v_today := (now() AT TIME ZONE p_timezone)::date;
  v_yesterday := v_today - INTERVAL '1 day';
  
  -- Get current streak record
  SELECT * INTO v_streak FROM login_streaks WHERE user_id = v_user_id;
  
  IF v_streak IS NULL THEN
    -- First login ever - streak starts at 0 (not 1)
    -- Streak only becomes 1 on the 2nd consecutive day
    INSERT INTO login_streaks (user_id, current_streak, longest_streak, last_login_date, streak_expires_at)
    VALUES (v_user_id, 0, 0, v_today, (v_today + INTERVAL '1 day' + INTERVAL '23 hours 59 minutes 59 seconds')::timestamptz)
    RETURNING * INTO v_streak;
    
    RETURN json_build_object(
      'success', true,
      'streak', 0,
      'longest_streak', 0,
      'is_new_day', true,
      'streak_extended', false
    );
  END IF;
  
  -- Already logged in today
  IF v_streak.last_login_date = v_today THEN
    RETURN json_build_object(
      'success', true,
      'streak', v_streak.current_streak,
      'longest_streak', v_streak.longest_streak,
      'is_new_day', false,
      'streak_extended', false,
      'expires_at', v_streak.streak_expires_at
    );
  END IF;
  
  -- Check if streak continues (logged in yesterday)
  IF v_streak.last_login_date = v_yesterday THEN
    v_new_streak := v_streak.current_streak + 1;
    v_was_extended := true;
  ELSE
    -- Streak broken - reset to 0 (they just came back, not consecutive yet)
    v_new_streak := 0;
    v_was_extended := false;
  END IF;
  
  -- Update streak record
  UPDATE login_streaks
  SET 
    current_streak = v_new_streak,
    longest_streak = GREATEST(longest_streak, v_new_streak),
    last_login_date = v_today,
    streak_expires_at = (v_today + INTERVAL '1 day' + INTERVAL '23 hours 59 minutes 59 seconds')::timestamptz,
    updated_at = now()
  WHERE user_id = v_user_id
  RETURNING * INTO v_streak;
  
  RETURN json_build_object(
    'success', true,
    'streak', v_streak.current_streak,
    'longest_streak', v_streak.longest_streak,
    'is_new_day', true,
    'streak_extended', v_was_extended,
    'expires_at', v_streak.streak_expires_at
  );
END;
$function$;

-- Also update get_login_streak_status to use timezone parameter
CREATE OR REPLACE FUNCTION public.get_login_streak_status(p_timezone TEXT DEFAULT 'UTC')
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_streak RECORD;
  v_hours_remaining NUMERIC;
  v_today DATE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  v_today := (now() AT TIME ZONE p_timezone)::date;
  
  SELECT * INTO v_streak FROM login_streaks WHERE user_id = v_user_id;
  
  IF v_streak IS NULL THEN
    RETURN json_build_object(
      'success', true,
      'streak', 0,
      'longest_streak', 0,
      'hours_remaining', null,
      'needs_login_today', true
    );
  END IF;
  
  -- Calculate hours remaining until streak expires
  IF v_streak.streak_expires_at IS NOT NULL THEN
    v_hours_remaining := EXTRACT(EPOCH FROM (v_streak.streak_expires_at - now())) / 3600;
  ELSE
    v_hours_remaining := null;
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'streak', v_streak.current_streak,
    'longest_streak', v_streak.longest_streak,
    'hours_remaining', v_hours_remaining,
    'needs_login_today', v_streak.last_login_date != v_today,
    'expires_at', v_streak.streak_expires_at
  );
END;
$function$;
