-- Create post_mood_signals table needed by get_ranked_feed
CREATE TABLE IF NOT EXISTS public.post_mood_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  mood text NOT NULL,
  signal_strength numeric NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, mood)
);

ALTER TABLE public.post_mood_signals ENABLE ROW LEVEL SECURITY;

-- Anyone can read mood signals (needed by the feed RPC)
CREATE POLICY "Anyone can read mood signals" ON public.post_mood_signals
  FOR SELECT TO authenticated USING (true);

-- Only service role can insert (via moderation/AI functions)
-- No INSERT/UPDATE/DELETE policies for authenticated users