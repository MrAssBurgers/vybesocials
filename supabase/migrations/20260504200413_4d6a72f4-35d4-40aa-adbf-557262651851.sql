SELECT cron.schedule(
  'smart-ping-dispatcher-15m',
  '*/15 * * * *',
  $$ SELECT net.http_post(
    url:='https://agtcyxjxgkdyoxwxkjth.supabase.co/functions/v1/smart-ping-dispatcher',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFndGN5eGp4Z2tkeW94d3hranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjk5NTMsImV4cCI6MjA4NTgwNTk1M30.G92pPYU9K2z3yqXtN5R7WR_-EAIVTfl-T-GlJ-N8oYg"}'::jsonb,
    body:='{}'::jsonb
  ); $$
);
SELECT cron.schedule(
  'smart-brief-pings-3x',
  '15 13,18,23 * * *',
  $$ SELECT net.http_post(
    url:='https://agtcyxjxgkdyoxwxkjth.supabase.co/functions/v1/smart-brief-pings',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFndGN5eGp4Z2tkeW94d3hranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjk5NTMsImV4cCI6MjA4NTgwNTk1M30.G92pPYU9K2z3yqXtN5R7WR_-EAIVTfl-T-GlJ-N8oYg"}'::jsonb,
    body:='{}'::jsonb
  ); $$
);