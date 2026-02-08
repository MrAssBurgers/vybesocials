-- Create login streaks table for tracking daily login streaks
CREATE TABLE public.login_streaks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_login_date DATE,
  streak_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.login_streaks ENABLE ROW LEVEL SECURITY;

-- Users can read their own streak
CREATE POLICY "Users can view their own streak"
  ON public.login_streaks FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own streak
CREATE POLICY "Users can update their own streak"
  ON public.login_streaks FOR UPDATE
  USING (auth.uid() = user_id);

-- System can insert streaks (via trigger)
CREATE POLICY "System can insert streaks"
  ON public.login_streaks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Enable realtime for instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.login_streaks;

-- Function to update login streak
CREATE OR REPLACE FUNCTION public.update_login_streak()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  
  v_today := CURRENT_DATE;
  v_yesterday := v_today - INTERVAL '1 day';
  
  -- Get current streak record
  SELECT * INTO v_streak FROM login_streaks WHERE user_id = v_user_id;
  
  IF v_streak IS NULL THEN
    -- First login ever - create streak record
    INSERT INTO login_streaks (user_id, current_streak, longest_streak, last_login_date, streak_expires_at)
    VALUES (v_user_id, 1, 1, v_today, (v_today + INTERVAL '1 day' + INTERVAL '23 hours 59 minutes 59 seconds')::timestamptz)
    RETURNING * INTO v_streak;
    
    RETURN json_build_object(
      'success', true,
      'streak', 1,
      'longest_streak', 1,
      'is_new_day', true,
      'streak_extended', true
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
    -- Streak broken - start fresh
    v_new_streak := 1;
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
$$;

-- Function to get streak status with time remaining
CREATE OR REPLACE FUNCTION public.get_login_streak_status()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_streak RECORD;
  v_hours_remaining NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
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
    'needs_login_today', v_streak.last_login_date != CURRENT_DATE,
    'expires_at', v_streak.streak_expires_at
  );
END;
$$;