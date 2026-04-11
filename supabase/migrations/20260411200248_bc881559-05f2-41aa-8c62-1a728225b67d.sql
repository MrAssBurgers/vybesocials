
-- Parental controls table
CREATE TABLE public.parental_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  content_filter_level TEXT NOT NULL DEFAULT 'protected',
  max_screen_time_minutes INTEGER DEFAULT 120,
  allowed_features TEXT[] DEFAULT ARRAY['messaging', 'feed', 'profile'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.parental_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own parental controls"
  ON public.parental_controls FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own parental controls"
  ON public.parental_controls FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own parental controls"
  ON public.parental_controls FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Screen time tracking table
CREATE TABLE public.screen_time_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.screen_time_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own screen time"
  ON public.screen_time_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own screen time"
  ON public.screen_time_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own screen time"
  ON public.screen_time_sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Index for efficient daily lookups
CREATE INDEX idx_screen_time_user_date ON public.screen_time_sessions(user_id, session_date);
