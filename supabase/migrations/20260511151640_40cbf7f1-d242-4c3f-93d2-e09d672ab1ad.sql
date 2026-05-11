-- 1) Cleanup function: actually DELETE expired rows (idempotent)
CREATE OR REPLACE FUNCTION public.cleanup_stale_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE challenges SET is_active = false
   WHERE type = 'daily' AND active_date IS NOT NULL
     AND active_date < CURRENT_DATE AND is_active = true;

  UPDATE challenges SET is_active = false
   WHERE type = 'weekly' AND active_week_start IS NOT NULL
     AND active_week_start < (CURRENT_DATE - INTERVAL '6 days')
     AND is_active = true;

  DELETE FROM challenges
   WHERE type = 'daily' AND active_date IS NOT NULL
     AND active_date < (CURRENT_DATE - INTERVAL '7 days')
     AND is_active = false;

  DELETE FROM challenges
   WHERE type = 'weekly' AND active_week_start IS NOT NULL
     AND active_week_start < (CURRENT_DATE - INTERVAL '28 days')
     AND is_active = false;
END;
$$;

-- 2) Make rotate_challenges SECURITY DEFINER so any signed-in user
--    can self-heal a missing day's challenges (function still only
--    inserts from the template library — no user input).
CREATE OR REPLACE FUNCTION public.rotate_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_week_start DATE;
  v_template RECORD;
  v_daily_count INT;
  v_weekly_count INT;
  v_max_daily INT := 6;
  v_max_weekly INT := 6;
BEGIN
  v_week_start := v_today - (EXTRACT(ISODOW FROM v_today)::INT - 1);

  PERFORM cleanup_stale_challenges();

  SELECT COUNT(*) INTO v_daily_count
    FROM challenges
   WHERE type = 'daily' AND active_date = v_today AND is_active = true;

  IF v_daily_count < v_max_daily THEN
    FOR v_template IN
      SELECT * FROM challenge_templates
       WHERE type = 'daily' AND is_active = true
       ORDER BY random()
       LIMIT (v_max_daily - v_daily_count)
    LOOP
      INSERT INTO challenges (
        title, description, type, requirement_type, requirement_count,
        reward_badge_id, reward_xp, is_active, active_date, template_id
      ) VALUES (
        v_template.title, v_template.description, 'daily',
        v_template.requirement_type, v_template.requirement_count,
        v_template.reward_badge_id, COALESCE(v_template.reward_xp, 25),
        true, v_today, v_template.id
      );
    END LOOP;
  END IF;

  SELECT COUNT(*) INTO v_weekly_count
    FROM challenges
   WHERE type = 'weekly' AND active_week_start = v_week_start AND is_active = true;

  IF v_weekly_count < v_max_weekly THEN
    FOR v_template IN
      SELECT * FROM challenge_templates
       WHERE type = 'weekly' AND is_active = true
       ORDER BY random()
       LIMIT (v_max_weekly - v_weekly_count)
    LOOP
      INSERT INTO challenges (
        title, description, type, requirement_type, requirement_count,
        reward_badge_id, reward_xp, is_active, active_week_start, template_id
      ) VALUES (
        v_template.title, v_template.description, 'weekly',
        v_template.requirement_type, v_template.requirement_count,
        v_template.reward_badge_id, COALESCE(v_template.reward_xp, 75),
        true, v_week_start, v_template.id
      );
    END LOOP;
  END IF;
END;
$$;

-- Grant explicit execute to authenticated users
GRANT EXECUTE ON FUNCTION public.rotate_challenges() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_challenges() TO authenticated;

-- Run them now to populate
SELECT public.cleanup_stale_challenges();
SELECT public.rotate_challenges();
