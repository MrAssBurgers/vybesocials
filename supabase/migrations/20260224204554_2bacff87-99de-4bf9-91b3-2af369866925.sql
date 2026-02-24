
-- Rate limiting table for tracking request counts per key
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count int NOT NULL DEFAULT 1,
  UNIQUE(key, window_start)
);

-- Index for fast lookups
CREATE INDEX idx_rate_limits_key_window ON public.rate_limits (key, window_start);

-- Enable RLS but allow edge functions via service role
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No public access — only service role can read/write
-- (Edge functions use service role key)

-- Reusable rate limiting function
-- Returns true if request is ALLOWED, false if rate limited
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_max_requests int,
  p_window_seconds int DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count int;
BEGIN
  -- Calculate window start (truncate to window boundary)
  v_window_start := date_trunc('second', now()) - 
    ((EXTRACT(EPOCH FROM now())::int % p_window_seconds) * interval '1 second');
  
  -- Upsert: increment counter or create new entry
  INSERT INTO rate_limits (key, window_start, request_count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start) 
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_count;
  
  -- Clean up old windows (older than 1 hour) periodically
  IF random() < 0.01 THEN
    DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour';
  END IF;
  
  RETURN v_count <= p_max_requests;
END;
$$;

-- Signup rate limit: max 3 signups per IP per hour  
-- Post creation rate limit: max 20 posts per user per hour
-- DM rate limit: max 60 messages per user per minute
-- AI feature rate limit: max 10 requests per user per minute
-- Password reset rate limit: max 3 requests per email per hour

-- Grant execute to anon and authenticated for client-side checks
GRANT EXECUTE ON FUNCTION public.check_rate_limit TO anon, authenticated;
