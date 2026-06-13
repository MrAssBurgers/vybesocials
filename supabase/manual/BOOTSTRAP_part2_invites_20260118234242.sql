-- Bootstrap migration 20260118234242 (skeleton DB already has invites / invite_redemptions)
-- Run: npx supabase db query --linked -f supabase/manual/BOOTSTRAP_part2_invites_20260118234242.sql
-- Then: npx supabase migration repair --status applied 20260118234242

CREATE TABLE IF NOT EXISTS public.invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
  max_uses INTEGER DEFAULT 100,
  use_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.invite_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invite_id UUID NOT NULL REFERENCES public.invites(id) ON DELETE CASCADE,
  redeemer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(invite_id, redeemer_id)
);

CREATE TABLE IF NOT EXISTS public.user_badges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL,
  badge_name TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}',
  UNIQUE(user_id, badge_type)
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_guidelines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_current BOOLEAN DEFAULT false
);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_guidelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own invites" ON public.invites;
CREATE POLICY "Users can view their own invites" ON public.invites FOR SELECT USING (auth.uid() = inviter_id);

DROP POLICY IF EXISTS "Users can create their own invites" ON public.invites;
CREATE POLICY "Users can create their own invites" ON public.invites FOR INSERT WITH CHECK (auth.uid() = inviter_id);

DROP POLICY IF EXISTS "Anyone can view invite by code" ON public.invites;
CREATE POLICY "Anyone can view invite by code" ON public.invites FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can view their own redemptions" ON public.invite_redemptions;
CREATE POLICY "Users can view their own redemptions" ON public.invite_redemptions FOR SELECT USING (auth.uid() = redeemer_id);

DROP POLICY IF EXISTS "Users can redeem invites" ON public.invite_redemptions;
CREATE POLICY "Users can redeem invites" ON public.invite_redemptions FOR INSERT WITH CHECK (auth.uid() = redeemer_id);

DROP POLICY IF EXISTS "Users can view all badges" ON public.user_badges;
CREATE POLICY "Users can view all badges" ON public.user_badges FOR SELECT USING (true);

DROP POLICY IF EXISTS "System can insert badges" ON public.user_badges;
CREATE POLICY "System can insert badges" ON public.user_badges FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own events" ON public.analytics_events;
CREATE POLICY "Users can insert their own events" ON public.analytics_events FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Admins can view all events" ON public.analytics_events;
CREATE POLICY "Admins can view all events" ON public.analytics_events FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Anyone can view community guidelines" ON public.community_guidelines;
CREATE POLICY "Anyone can view community guidelines" ON public.community_guidelines FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT upper(substring(md5(random()::text) from 1 for 8))
$$;

CREATE OR REPLACE FUNCTION public.check_invite_milestones()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  invite_count INTEGER;
  inviter_id UUID;
BEGIN
  SELECT i.inviter_id INTO inviter_id FROM public.invites i WHERE i.id = NEW.invite_id;
  SELECT COUNT(DISTINCT ir.redeemer_id) INTO invite_count
  FROM public.invite_redemptions ir
  JOIN public.invites i ON ir.invite_id = i.id
  WHERE i.inviter_id = inviter_id;

  IF invite_count >= 1 THEN
    INSERT INTO public.user_badges (user_id, badge_type, badge_name, metadata)
    VALUES (inviter_id, 'invite_1', 'First Invite', '{"milestone": 1}'::jsonb)
    ON CONFLICT (user_id, badge_type) DO NOTHING;
  END IF;
  IF invite_count >= 3 THEN
    INSERT INTO public.user_badges (user_id, badge_type, badge_name, metadata)
    VALUES (inviter_id, 'invite_3', 'Rising Star', '{"milestone": 3, "reward": "theme_unlock"}'::jsonb)
    ON CONFLICT (user_id, badge_type) DO NOTHING;
  END IF;
  IF invite_count >= 10 THEN
    INSERT INTO public.user_badges (user_id, badge_type, badge_name, metadata)
    VALUES (inviter_id, 'invite_10', 'Early Builder', '{"milestone": 10}'::jsonb)
    ON CONFLICT (user_id, badge_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_invite_milestones_trigger ON public.invite_redemptions;
CREATE TRIGGER check_invite_milestones_trigger
AFTER INSERT ON public.invite_redemptions
FOR EACH ROW EXECUTE FUNCTION public.check_invite_milestones();

INSERT INTO public.community_guidelines (version, content, is_current)
SELECT '1.0', '# VYBE Community Guidelines

Welcome to VYBE!', true
WHERE NOT EXISTS (SELECT 1 FROM public.community_guidelines WHERE version = '1.0');

CREATE INDEX IF NOT EXISTS idx_analytics_events_name_date ON public.analytics_events (event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON public.analytics_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invites_code ON public.invites (invite_code);
CREATE INDEX IF NOT EXISTS idx_invite_redemptions_invite ON public.invite_redemptions (invite_id);
