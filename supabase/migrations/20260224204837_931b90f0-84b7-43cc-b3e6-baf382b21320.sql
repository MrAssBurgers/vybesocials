
-- Error log table for persisting client-side errors
CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  error_message text NOT NULL,
  error_stack text,
  error_type text NOT NULL DEFAULT 'error',
  page_url text,
  user_agent text,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for admin queries
CREATE INDEX idx_error_logs_created ON public.error_logs (created_at DESC);
CREATE INDEX idx_error_logs_type ON public.error_logs (error_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Anyone can INSERT errors (including unauthenticated users)
CREATE POLICY "Anyone can log errors"
  ON public.error_logs FOR INSERT
  WITH CHECK (true);

-- Only admins can read error logs
CREATE POLICY "Admins can read error logs"
  ON public.error_logs FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Auto-cleanup: delete logs older than 30 days
CREATE OR REPLACE FUNCTION public.cleanup_old_error_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM error_logs WHERE created_at < now() - interval '30 days';
$$;
