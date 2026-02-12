
-- Update rotation function to prefer newest templates (AI-generated ones)
-- This ensures freshly generated challenges are picked first
CREATE OR REPLACE FUNCTION public.rotate_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today DATE := CURRENT_DATE;
  week_start DATE := date_trunc('week', CURRENT_DATE)::date;
  daily_template RECORD;
  weekly_template RECORD;
  daily_count INTEGER := 0;
  weekly_count INTEGER := 0;
  used_req_types TEXT[] := '{}';
BEGIN
  -- === DAILY ROTATION ===
  SELECT COUNT(*) INTO daily_count 
  FROM challenges 
  WHERE type = 'daily' AND active_date = today AND is_active = true;

  IF daily_count = 0 THEN
    -- Deactivate old daily challenges
    UPDATE challenges 
    SET is_active = false 
    WHERE type = 'daily' AND active_date IS NOT NULL AND active_date < today;

    -- Pick 3 daily templates, preferring newest (AI-generated), ensuring diverse requirement types
    used_req_types := '{}';
    FOR daily_template IN 
      SELECT * FROM challenge_templates 
      WHERE type = 'daily' AND is_active = true 
        AND requirement_type != ALL(used_req_types)
      ORDER BY created_at DESC, random() 
      LIMIT 3
    LOOP
      INSERT INTO challenges (title, description, type, requirement_type, requirement_count, reward_xp, reward_badge_id, is_active, active_date, template_id)
      VALUES (
        daily_template.title,
        daily_template.description,
        'daily',
        daily_template.requirement_type,
        daily_template.requirement_count,
        daily_template.reward_xp,
        daily_template.reward_badge_id,
        true,
        today,
        daily_template.id
      );
      used_req_types := array_append(used_req_types, daily_template.requirement_type);
    END LOOP;
  END IF;

  -- === WEEKLY ROTATION ===
  SELECT COUNT(*) INTO weekly_count 
  FROM challenges 
  WHERE type = 'weekly' AND active_week_start = week_start AND is_active = true;

  IF weekly_count = 0 THEN
    -- Deactivate old weekly challenges
    UPDATE challenges 
    SET is_active = false 
    WHERE type = 'weekly' AND active_week_start IS NOT NULL AND active_week_start < week_start;

    -- Pick 3 weekly templates, preferring newest, diverse types
    used_req_types := '{}';
    FOR weekly_template IN 
      SELECT * FROM challenge_templates 
      WHERE type = 'weekly' AND is_active = true
        AND requirement_type != ALL(used_req_types)
      ORDER BY created_at DESC, random() 
      LIMIT 3
    LOOP
      INSERT INTO challenges (title, description, type, requirement_type, requirement_count, reward_xp, reward_badge_id, is_active, active_week_start, template_id)
      VALUES (
        weekly_template.title,
        weekly_template.description,
        'weekly',
        weekly_template.requirement_type,
        weekly_template.requirement_count,
        weekly_template.reward_xp,
        weekly_template.reward_badge_id,
        true,
        week_start,
        weekly_template.id
      );
      used_req_types := array_append(used_req_types, weekly_template.requirement_type);
    END LOOP;
  END IF;
  
  -- Cleanup: deactivate old AI-generated templates (keep last 50 per type to avoid bloat)
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY type ORDER BY created_at DESC) as rn
    FROM challenge_templates
  )
  UPDATE challenge_templates 
  SET is_active = false 
  WHERE id IN (SELECT id FROM ranked WHERE rn > 50);
END;
$$;
