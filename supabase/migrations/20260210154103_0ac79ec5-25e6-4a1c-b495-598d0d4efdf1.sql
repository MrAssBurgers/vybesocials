
-- Update login streak functions to accept client timezone for accurate day boundaries

CREATE OR REPLACE FUNCTION public.update_login_streak(p_timezone TEXT DEFAULT 'UTC')
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  
  -- Use client timezone for "today" calculation
  v_today := (now() AT TIME ZONE p_timezone)::DATE;
  v_yesterday := v_today - INTERVAL '1 day';
  
  -- Get current streak record
  SELECT * INTO v_streak FROM login_streaks WHERE user_id = v_user_id;
  
  IF v_streak IS NULL THEN
    INSERT INTO login_streaks (user_id, current_streak, longest_streak, last_login_date, streak_expires_at)
    VALUES (v_user_id, 1, 1, v_today, ((v_today + INTERVAL '1 day')::TIMESTAMP AT TIME ZONE p_timezone + INTERVAL '23 hours 59 minutes 59 seconds'))
    RETURNING * INTO v_streak;
    
    RETURN json_build_object(
      'success', true, 'streak', 1, 'longest_streak', 1,
      'is_new_day', true, 'streak_extended', true
    );
  END IF;
  
  IF v_streak.last_login_date = v_today THEN
    RETURN json_build_object(
      'success', true, 'streak', v_streak.current_streak,
      'longest_streak', v_streak.longest_streak,
      'is_new_day', false, 'streak_extended', false,
      'expires_at', v_streak.streak_expires_at
    );
  END IF;
  
  IF v_streak.last_login_date = v_yesterday THEN
    v_new_streak := v_streak.current_streak + 1;
    v_was_extended := true;
  ELSE
    v_new_streak := 1;
    v_was_extended := false;
  END IF;
  
  UPDATE login_streaks
  SET 
    current_streak = v_new_streak,
    longest_streak = GREATEST(longest_streak, v_new_streak),
    last_login_date = v_today,
    streak_expires_at = ((v_today + INTERVAL '1 day')::TIMESTAMP AT TIME ZONE p_timezone + INTERVAL '23 hours 59 minutes 59 seconds'),
    updated_at = now()
  WHERE user_id = v_user_id
  RETURNING * INTO v_streak;
  
  RETURN json_build_object(
    'success', true, 'streak', v_streak.current_streak,
    'longest_streak', v_streak.longest_streak,
    'is_new_day', true, 'streak_extended', v_was_extended,
    'expires_at', v_streak.streak_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_login_streak_status(p_timezone TEXT DEFAULT 'UTC')
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  
  v_today := (now() AT TIME ZONE p_timezone)::DATE;
  
  SELECT * INTO v_streak FROM login_streaks WHERE user_id = v_user_id;
  
  IF v_streak IS NULL THEN
    RETURN json_build_object(
      'success', true, 'streak', 0, 'longest_streak', 0,
      'hours_remaining', null, 'needs_login_today', true
    );
  END IF;
  
  IF v_streak.streak_expires_at IS NOT NULL THEN
    v_hours_remaining := EXTRACT(EPOCH FROM (v_streak.streak_expires_at - now())) / 3600;
  ELSE
    v_hours_remaining := null;
  END IF;
  
  RETURN json_build_object(
    'success', true, 'streak', v_streak.current_streak,
    'longest_streak', v_streak.longest_streak,
    'hours_remaining', v_hours_remaining,
    'needs_login_today', v_streak.last_login_date != v_today,
    'expires_at', v_streak.streak_expires_at
  );
END;
$$;
