
-- Function to rotate daily and weekly challenges from templates
CREATE OR REPLACE FUNCTION public.rotate_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_week_start DATE;
  v_template RECORD;
  v_daily_count INT;
  v_weekly_count INT;
  v_max_daily INT := 3;
  v_max_weekly INT := 3;
BEGIN
  -- Calculate Monday of current week
  v_week_start := v_today - (EXTRACT(ISODOW FROM v_today)::INT - 1);

  -- 1. Deactivate expired challenges
  PERFORM cleanup_stale_challenges();

  -- 2. Check if today's daily challenges already exist
  SELECT COUNT(*) INTO v_daily_count
  FROM challenges
  WHERE type = 'daily' AND active_date = v_today AND is_active = true;

  -- 3. If no daily challenges for today, create from templates
  IF v_daily_count = 0 THEN
    FOR v_template IN
      SELECT * FROM challenge_templates
      WHERE type = 'daily' AND is_active = true
      ORDER BY random()
      LIMIT v_max_daily
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

  -- 4. Check if this week's weekly challenges already exist
  SELECT COUNT(*) INTO v_weekly_count
  FROM challenges
  WHERE type = 'weekly' AND active_week_start = v_week_start AND is_active = true;

  -- 5. If no weekly challenges for this week, create from templates
  IF v_weekly_count = 0 THEN
    FOR v_template IN
      SELECT * FROM challenge_templates
      WHERE type = 'weekly' AND is_active = true
      ORDER BY random()
      LIMIT v_max_weekly
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
