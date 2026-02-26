
-- Event reminders table
CREATE TABLE public.event_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  reminded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id)
);

ALTER TABLE public.event_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own reminders" ON public.event_reminders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Enable realtime for event_reminders
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_reminders;

-- XP Leaderboard view (materialized as a view for simplicity)
CREATE OR REPLACE VIEW public.xp_leaderboard AS
SELECT 
  ul.user_id,
  ul.total_xp,
  ul.current_level,
  p.username,
  p.display_name,
  p.avatar_url,
  p.is_verified,
  RANK() OVER (ORDER BY ul.total_xp DESC) as rank
FROM public.user_levels ul
JOIN public.profiles p ON p.id = ul.user_id
WHERE ul.total_xp > 0
ORDER BY ul.total_xp DESC;
