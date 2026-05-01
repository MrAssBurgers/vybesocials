
CREATE OR REPLACE FUNCTION public.update_login_streak()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id UUID;
  v_streak RECORD;
  v_today DATE;
  v_yesterday DATE;
  v_new_streak INTEGER;
  v_was_extended BOOLEAN := false;
  v_shield_used BOOLEAN := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_today := CURRENT_DATE;
  v_yesterday := v_today - INTERVAL '1 day';

  SELECT * INTO v_streak FROM login_streaks WHERE user_id = v_user_id;

  IF v_streak IS NULL THEN
    INSERT INTO login_streaks (user_id, current_streak, longest_streak, last_login_date, streak_expires_at)
    VALUES (v_user_id, 1, 1, v_today,
            (v_today + INTERVAL '1 day' + INTERVAL '23 hours 59 minutes 59 seconds')::timestamptz)
    RETURNING * INTO v_streak;

    RETURN json_build_object(
      'success', true, 'streak', 1, 'longest_streak', 1,
      'is_new_day', true, 'streak_extended', true, 'shield_used', false
    );
  END IF;

  IF v_streak.last_login_date = v_today THEN
    RETURN json_build_object(
      'success', true, 'streak', v_streak.current_streak,
      'longest_streak', v_streak.longest_streak,
      'is_new_day', false, 'streak_extended', false, 'shield_used', false,
      'expires_at', v_streak.streak_expires_at
    );
  END IF;

  IF v_streak.last_login_date = v_yesterday THEN
    v_new_streak := v_streak.current_streak + 1;
    v_was_extended := true;
  ELSE
    -- Would normally break — try to consume a Streak Shield
    IF public.consume_streak_shield(v_user_id) THEN
      v_new_streak := v_streak.current_streak + 1;
      v_was_extended := true;
      v_shield_used := true;
    ELSE
      v_new_streak := 1;
      v_was_extended := false;
    END IF;
  END IF;

  UPDATE login_streaks
  SET current_streak = v_new_streak,
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
    'shield_used', v_shield_used,
    'expires_at', v_streak.streak_expires_at
  );
END;
$function$;
