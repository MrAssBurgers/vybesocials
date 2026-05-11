-- Replace stale cron jobs (old project URL) and fix cleanup to actually delete.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'generate-daily-challenges','generate-weekly-challenges','cleanup-stale-challenges',
      'refresh-challenges-daily','refresh-challenges-weekly','cleanup-old-challenges'
    )
    OR command ILIKE '%generate-challenges%'
    OR command ILIKE '%cleanup_stale_challenges%'
  LOOP
    BEGIN PERFORM cron.unschedule(r.jobid); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END $$;

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

SELECT cron.schedule(
  'refresh-challenges-daily',
  '0 0 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://agtcyxjxgkdyoxwxkjth.supabase.co/functions/v1/generate-challenges',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFndGN5eGp4Z2tkeW94d3hranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjk5NTMsImV4cCI6MjA4NTgwNTk1M30.G92pPYU9K2z3yqXtN5R7WR_-EAIVTfl-T-GlJ-N8oYg"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

SELECT cron.schedule(
  'refresh-challenges-weekly',
  '0 0 * * 1',
  $cron$
  SELECT net.http_post(
    url := 'https://agtcyxjxgkdyoxwxkjth.supabase.co/functions/v1/generate-challenges',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFndGN5eGp4Z2tkeW94d3hranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjk5NTMsImV4cCI6MjA4NTgwNTk1M30.G92pPYU9K2z3yqXtN5R7WR_-EAIVTfl-T-GlJ-N8oYg"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

SELECT cron.schedule(
  'cleanup-old-challenges',
  '5 0 * * *',
  $cron$ SELECT public.cleanup_stale_challenges(); $cron$
);

SELECT public.cleanup_stale_challenges();
SELECT public.rotate_challenges();
