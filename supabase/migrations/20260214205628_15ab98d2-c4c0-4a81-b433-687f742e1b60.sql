
-- =============================================
-- FIX 1: Enhanced track_daily_login with XP grant
-- =============================================
CREATE OR REPLACE FUNCTION public.track_daily_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id uuid;
  v_profile_id uuid;
  v_last_login date;
BEGIN
  v_auth_id := auth.uid();
  IF v_auth_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_profile_id FROM profiles WHERE user_id = v_auth_id;
  IF v_profile_id IS NULL THEN RETURN; END IF;
  
  -- Check last login date for login-type daily challenges
  SELECT DATE(cp.updated_at) INTO v_last_login
  FROM challenge_progress cp
  JOIN challenges c ON c.id = cp.challenge_id
  WHERE cp.user_id = v_profile_id 
  AND c.requirement_type IN ('login', 'daily_login')
  AND c.type = 'daily'
  ORDER BY cp.updated_at DESC
  LIMIT 1;
  
  -- Only credit if hasn't logged in today
  IF v_last_login IS NULL OR v_last_login < CURRENT_DATE THEN
    -- Increment login challenge progress
    PERFORM increment_challenge_progress(v_profile_id, 'login');
    PERFORM increment_challenge_progress(v_profile_id, 'daily_login');
    
    -- Grant 15 XP directly for daily login
    PERFORM add_user_xp(v_profile_id, 15);
  END IF;
END;
$$;

-- =============================================
-- FIX 2: Cleanup old stale active challenges
-- =============================================
CREATE OR REPLACE FUNCTION public.cleanup_stale_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deactivate daily challenges from previous days
  UPDATE challenges 
  SET is_active = false 
  WHERE type = 'daily' 
  AND active_date IS NOT NULL 
  AND active_date < CURRENT_DATE 
  AND is_active = true;
  
  -- Deactivate weekly challenges from previous weeks
  UPDATE challenges 
  SET is_active = false 
  WHERE type = 'weekly' 
  AND active_week_start IS NOT NULL 
  AND active_week_start < (CURRENT_DATE - INTERVAL '6 days')
  AND is_active = true;
END;
$$;

-- =============================================
-- FIX 3: Ensure cron jobs exist for challenge generation
-- Remove old jobs if they exist, then recreate
-- =============================================

-- Unschedule old jobs if they exist (safe to call even if not found)
SELECT cron.unschedule('generate-daily-challenges') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-daily-challenges');
SELECT cron.unschedule('generate-weekly-challenges') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-weekly-challenges');
SELECT cron.unschedule('cleanup-stale-challenges') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-stale-challenges');

-- Also try to unschedule by old jobids if unnamed
DO $$
BEGIN
  -- Try to remove any existing challenge generation cron jobs
  PERFORM cron.unschedule(jobid) 
  FROM cron.job 
  WHERE command ILIKE '%generate-challenges%';
EXCEPTION WHEN OTHERS THEN
  -- Ignore errors if jobs don't exist
  NULL;
END;
$$;

-- Daily challenge generation at midnight UTC
SELECT cron.schedule(
  'generate-daily-challenges',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url:='https://agtcyxjxgkdyoxwxkjth.supabase.co/functions/v1/generate-challenges',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFndGN5eGp4Z2tkeW94d3hranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjk5NTMsImV4cCI6MjA4NTgwNTk1M30.G92pPYU9K2z3yqXtN5R7WR_-EAIVTfl-T-GlJ-N8oYg"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Weekly challenge generation on Mondays at midnight UTC
SELECT cron.schedule(
  'generate-weekly-challenges',
  '0 0 * * 1',
  $$
  SELECT net.http_post(
    url:='https://agtcyxjxgkdyoxwxkjth.supabase.co/functions/v1/generate-challenges',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFndGN5eGp4Z2tkeW94d3hranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjk5NTMsImV4cCI6MjA4NTgwNTk1M30.G92pPYU9K2z3yqXtN5R7WR_-EAIVTfl-T-GlJ-N8oYg"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Cleanup stale challenges every day at 00:05 UTC (after generation)
SELECT cron.schedule(
  'cleanup-stale-challenges',
  '5 0 * * *',
  $$
  SELECT public.cleanup_stale_challenges();
  $$
);
