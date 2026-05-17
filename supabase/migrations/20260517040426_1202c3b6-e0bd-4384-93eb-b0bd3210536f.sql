
-- Helper: idempotent schedule
DO $$
DECLARE
  fn_base text := 'https://agtcyxjxgkdyoxwxkjth.supabase.co/functions/v1';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFndGN5eGp4Z2tkeW94d3hranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjk5NTMsImV4cCI6MjA4NTgwNTk1M30.G92pPYU9K2z3yqXtN5R7WR_-EAIVTfl-T-GlJ-N8oYg';
  headers_json text;
BEGIN
  headers_json := format('{"Content-Type":"application/json","apikey":"%s","Authorization":"Bearer %s"}', anon_key, anon_key);

  -- Unschedule existing if present
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname IN (
    'ensure-active-challenges-hourly',
    'generate-daily-challenges-next-utc',
    'generate-weekly-challenges-next-utc',
    'cleanup-stale-challenges',
    'prewarm-daily-briefs-morning',
    'prewarm-daily-briefs-lunch',
    'prewarm-daily-briefs-dinner'
  );

  -- Hourly safety net
  PERFORM cron.schedule(
    'ensure-active-challenges-hourly',
    '0 * * * *',
    format($q$ SELECT public.ensure_active_challenges(); $q$)
  );

  -- Pre-generate next UTC day's daily challenges at 10:00 UTC
  PERFORM cron.schedule(
    'generate-daily-challenges-next-utc',
    '0 10 * * *',
    format($q$
      SELECT net.http_post(
        url:='%s/generate-challenges',
        headers:='%s'::jsonb,
        body:=jsonb_build_object('type','daily','target_date',(current_date + 1)::text)
      );
    $q$, fn_base, headers_json)
  );

  -- Pre-generate next week's weekly challenges on Sundays at 10:00 UTC
  PERFORM cron.schedule(
    'generate-weekly-challenges-next-utc',
    '0 10 * * 0',
    format($q$
      SELECT net.http_post(
        url:='%s/generate-challenges',
        headers:='%s'::jsonb,
        body:=jsonb_build_object('type','weekly','target_week_start',(current_date + 1)::text)
      );
    $q$, fn_base, headers_json)
  );

  -- Timezone-safe cleanup at 13:00 UTC
  PERFORM cron.schedule(
    'cleanup-stale-challenges',
    '0 13 * * *',
    $q$ SELECT public.cleanup_stale_challenges(); $q$
  );

  -- Pre-warm briefs (30 min before push)
  PERFORM cron.schedule(
    'prewarm-daily-briefs-morning',
    '30 5 * * *',
    format($q$
      SELECT net.http_post(
        url:='%s/prewarm-daily-briefs',
        headers:='%s'::jsonb,
        body:=jsonb_build_object('slot','morning')
      );
    $q$, fn_base, headers_json)
  );
  PERFORM cron.schedule(
    'prewarm-daily-briefs-lunch',
    '30 11 * * *',
    format($q$
      SELECT net.http_post(
        url:='%s/prewarm-daily-briefs',
        headers:='%s'::jsonb,
        body:=jsonb_build_object('slot','lunch')
      );
    $q$, fn_base, headers_json)
  );
  PERFORM cron.schedule(
    'prewarm-daily-briefs-dinner',
    '30 17 * * *',
    format($q$
      SELECT net.http_post(
        url:='%s/prewarm-daily-briefs',
        headers:='%s'::jsonb,
        body:=jsonb_build_object('slot','dinner')
      );
    $q$, fn_base, headers_json)
  );
END $$;
