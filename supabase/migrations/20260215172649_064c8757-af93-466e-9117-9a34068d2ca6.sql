
CREATE OR REPLACE FUNCTION public.increment_challenge_progress(p_user_id uuid, p_requirement_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_challenge RECORD;
  v_current_count int;
  v_is_completed boolean;
  v_start_date timestamptz;
  v_end_date timestamptz;
  v_action_count int;
BEGIN
  FOR v_challenge IN 
    SELECT id, requirement_count, reward_badge_id, reward_xp, type, active_date, active_week_start
    FROM challenges 
    WHERE is_active = true 
    AND requirement_type = p_requirement_type
  LOOP
    -- Get current progress
    SELECT current_count, is_completed INTO v_current_count, v_is_completed
    FROM challenge_progress
    WHERE user_id = p_user_id AND challenge_id = v_challenge.id;
    
    -- Skip if already completed
    IF v_is_completed IS TRUE THEN
      CONTINUE;
    END IF;
    
    -- For daily/weekly challenges, verify the action is within the challenge's active period
    IF v_challenge.type = 'daily' THEN
      v_start_date := COALESCE(v_challenge.active_date::timestamptz, CURRENT_DATE::timestamptz);
      v_end_date := v_start_date + INTERVAL '1 day';
      -- now() must be within the challenge's active period
      IF now() < v_start_date OR now() >= v_end_date THEN
        CONTINUE;
      END IF;
    ELSIF v_challenge.type = 'weekly' THEN
      v_start_date := COALESCE(v_challenge.active_week_start::timestamptz, CURRENT_DATE::timestamptz);
      v_end_date := v_start_date + INTERVAL '7 days';
      IF now() < v_start_date OR now() >= v_end_date THEN
        CONTINUE;
      END IF;
    END IF;
    
    v_current_count := COALESCE(v_current_count, 0) + 1;
    v_is_completed := v_current_count >= v_challenge.requirement_count;
    
    INSERT INTO challenge_progress (user_id, challenge_id, current_count, is_completed, completed_at, updated_at)
    VALUES (
      p_user_id, 
      v_challenge.id, 
      v_current_count, 
      v_is_completed,
      CASE WHEN v_is_completed THEN now() ELSE NULL END,
      now()
    )
    ON CONFLICT (user_id, challenge_id) 
    DO UPDATE SET 
      current_count = EXCLUDED.current_count,
      is_completed = EXCLUDED.is_completed,
      completed_at = CASE WHEN EXCLUDED.is_completed AND challenge_progress.completed_at IS NULL THEN now() ELSE challenge_progress.completed_at END,
      updated_at = now()
    WHERE NOT challenge_progress.is_completed;
  END LOOP;
END;
$function$;
