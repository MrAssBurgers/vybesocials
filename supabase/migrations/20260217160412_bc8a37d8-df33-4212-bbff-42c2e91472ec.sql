
-- Function to restore a broken streak for premium users
-- Sets the streak back to what it was before it broke (uses longest_streak as reference)
-- and resets the expiry window
CREATE OR REPLACE FUNCTION public.restore_login_streak(p_timezone text DEFAULT 'UTC')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_streak_record login_streaks%ROWTYPE;
  v_today date;
  v_result json;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get current date in user's timezone
  v_today := (now() AT TIME ZONE p_timezone)::date;

  -- Get the user's streak record
  SELECT * INTO v_streak_record
  FROM login_streaks
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No streak record found');
  END IF;

  -- Only allow restore if streak is currently broken (expired or reset to 0/1 after being higher)
  -- Check if streak_expires_at is in the past (streak has expired)
  IF v_streak_record.streak_expires_at IS NOT NULL AND v_streak_record.streak_expires_at > now() THEN
    RETURN json_build_object('success', false, 'error', 'Streak is still active, no restore needed');
  END IF;

  -- Restore the streak to the longest streak value
  UPDATE login_streaks
  SET 
    current_streak = v_streak_record.longest_streak,
    last_login_date = v_today,
    streak_expires_at = (v_today + interval '1 day' + interval '7 hours') AT TIME ZONE p_timezone,
    updated_at = now()
  WHERE user_id = v_user_id;

  RETURN json_build_object(
    'success', true, 
    'restored_streak', v_streak_record.longest_streak,
    'message', 'Streak restored!'
  );
END;
$$;
