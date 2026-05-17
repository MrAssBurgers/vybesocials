
-- 1) Daily Brief cache
CREATE TABLE IF NOT EXISTS public.daily_brief_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('morning','lunch','dinner')),
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '12 hours'),
  UNIQUE (user_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_daily_brief_cache_user ON public.daily_brief_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_brief_cache_expires ON public.daily_brief_cache(expires_at);

ALTER TABLE public.daily_brief_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own brief cache" ON public.daily_brief_cache;
CREATE POLICY "users read own brief cache"
  ON public.daily_brief_cache FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- writes are done by service role only (edge functions)

-- 2) Rewrite cleanup_stale_challenges (timezone-safe + dedup)
CREATE OR REPLACE FUNCTION public.cleanup_stale_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deactivate daily challenges only after UTC-12 has finished the day
  -- (i.e., now() > active_date + 1 day + 12 hours UTC)
  UPDATE challenges SET is_active = false
   WHERE type = 'daily' AND active_date IS NOT NULL
     AND is_active = true
     AND (now() AT TIME ZONE 'UTC') > ((active_date + INTERVAL '1 day' + INTERVAL '12 hours'));

  -- Deactivate weekly challenges only after UTC-12 has finished the week
  UPDATE challenges SET is_active = false
   WHERE type = 'weekly' AND active_week_start IS NOT NULL
     AND is_active = true
     AND (now() AT TIME ZONE 'UTC') > ((active_week_start + INTERVAL '7 days' + INTERVAL '12 hours'));

  -- Dedup: per (type, active_date) keep oldest active row per title
  DELETE FROM challenges c
   USING challenges c2
   WHERE c.type = 'daily'
     AND c.active_date IS NOT NULL
     AND c2.type = 'daily'
     AND c2.active_date = c.active_date
     AND c2.title = c.title
     AND c2.id < c.id;

  DELETE FROM challenges c
   USING challenges c2
   WHERE c.type = 'weekly'
     AND c.active_week_start IS NOT NULL
     AND c2.type = 'weekly'
     AND c2.active_week_start = c.active_week_start
     AND c2.title = c.title
     AND c2.id < c.id;

  -- Hard purge old inactive rows
  DELETE FROM challenges
   WHERE type = 'daily' AND active_date IS NOT NULL
     AND active_date < (CURRENT_DATE - INTERVAL '8 days')
     AND is_active = false;

  DELETE FROM challenges
   WHERE type = 'weekly' AND active_week_start IS NOT NULL
     AND active_week_start < (CURRENT_DATE - INTERVAL '29 days')
     AND is_active = false;

  -- Clean expired brief cache rows
  DELETE FROM daily_brief_cache WHERE expires_at < now() - INTERVAL '1 day';
END;
$$;

-- 3) ensure_active_challenges — SQL safety net, no AI required
CREATE OR REPLACE FUNCTION public.ensure_active_challenges()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
  v_tomorrow DATE := v_today + 1;
  v_week_start DATE := v_today - (EXTRACT(ISODOW FROM v_today)::INT - 1);
  v_next_week DATE := v_week_start + 7;
  v_max_daily INT := 6;
  v_max_weekly INT := 6;
  v_count INT;
  v_template RECORD;
  v_inserted INT := 0;
  v_target_date DATE;
  v_target_week DATE;
BEGIN
  -- DAILY for today + tomorrow
  FOREACH v_target_date IN ARRAY ARRAY[v_today, v_tomorrow] LOOP
    SELECT COUNT(*) INTO v_count
      FROM challenges
     WHERE type = 'daily' AND active_date = v_target_date AND is_active = true;

    IF v_count < v_max_daily THEN
      FOR v_template IN
        SELECT * FROM challenge_templates
         WHERE type = 'daily' AND is_active = true
           AND title NOT IN (
             SELECT title FROM challenges
              WHERE type = 'daily' AND active_date = v_target_date
           )
         ORDER BY random()
         LIMIT (v_max_daily - v_count)
      LOOP
        INSERT INTO challenges (
          title, description, type, requirement_type, requirement_count,
          reward_badge_id, reward_xp, is_active, active_date, template_id
        ) VALUES (
          v_template.title, v_template.description, 'daily',
          v_template.requirement_type, v_template.requirement_count,
          v_template.reward_badge_id, COALESCE(v_template.reward_xp, 25),
          true, v_target_date, v_template.id
        );
        v_inserted := v_inserted + 1;
      END LOOP;
    END IF;
  END LOOP;

  -- WEEKLY for current + next week
  FOREACH v_target_week IN ARRAY ARRAY[v_week_start, v_next_week] LOOP
    SELECT COUNT(*) INTO v_count
      FROM challenges
     WHERE type = 'weekly' AND active_week_start = v_target_week AND is_active = true;

    IF v_count < v_max_weekly THEN
      FOR v_template IN
        SELECT * FROM challenge_templates
         WHERE type = 'weekly' AND is_active = true
           AND title NOT IN (
             SELECT title FROM challenges
              WHERE type = 'weekly' AND active_week_start = v_target_week
           )
         ORDER BY random()
         LIMIT (v_max_weekly - v_count)
      LOOP
        INSERT INTO challenges (
          title, description, type, requirement_type, requirement_count,
          reward_badge_id, reward_xp, is_active, active_week_start, template_id
        ) VALUES (
          v_template.title, v_template.description, 'weekly',
          v_template.requirement_type, v_template.requirement_count,
          v_template.reward_badge_id, COALESCE(v_template.reward_xp, 75),
          true, v_target_week, v_template.id
        );
        v_inserted := v_inserted + 1;
      END LOOP;
    END IF;
  END LOOP;

  -- Also run cleanup
  PERFORM cleanup_stale_challenges();

  RETURN jsonb_build_object('inserted', v_inserted, 'today', v_today, 'tomorrow', v_tomorrow);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_active_challenges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_active_challenges() TO service_role;
