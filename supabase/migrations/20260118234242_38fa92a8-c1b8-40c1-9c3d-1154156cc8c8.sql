-- Create invites table for tracking referrals
CREATE TABLE public.invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '30 days'),
  max_uses INTEGER DEFAULT 100,
  use_count INTEGER DEFAULT 0
);

-- Create invite_redemptions table
CREATE TABLE public.invite_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invite_id UUID NOT NULL REFERENCES public.invites(id) ON DELETE CASCADE,
  redeemer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(invite_id, redeemer_id)
);

-- Create user_badges table for referral rewards
CREATE TABLE public.user_badges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL,
  badge_name TEXT NOT NULL,
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}',
  UNIQUE(user_id, badge_type)
);

-- Create analytics_events table for tracking
CREATE TABLE public.analytics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create community_guidelines table
CREATE TABLE public.community_guidelines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_current BOOLEAN DEFAULT false
);

-- Enable RLS on all tables
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_guidelines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for invites
CREATE POLICY "Users can view their own invites"
ON public.invites FOR SELECT
USING (auth.uid() = inviter_id);

CREATE POLICY "Users can create their own invites"
ON public.invites FOR INSERT
WITH CHECK (auth.uid() = inviter_id);

CREATE POLICY "Anyone can view invite by code"
ON public.invites FOR SELECT
USING (true);

-- RLS Policies for invite_redemptions
CREATE POLICY "Users can view their own redemptions"
ON public.invite_redemptions FOR SELECT
USING (auth.uid() = redeemer_id);

CREATE POLICY "Users can redeem invites"
ON public.invite_redemptions FOR INSERT
WITH CHECK (auth.uid() = redeemer_id);

-- RLS Policies for user_badges
CREATE POLICY "Users can view all badges"
ON public.user_badges FOR SELECT
USING (true);

CREATE POLICY "System can insert badges"
ON public.user_badges FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for analytics_events
CREATE POLICY "Users can insert their own events"
ON public.analytics_events FOR INSERT
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Admins can view all events"
ON public.analytics_events FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for community_guidelines
CREATE POLICY "Anyone can view community guidelines"
ON public.community_guidelines FOR SELECT
USING (true);

-- Create function to generate unique invite code
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT upper(substring(md5(random()::text) from 1 for 8))
$$;

-- Create function to award badge for invite milestones
CREATE OR REPLACE FUNCTION public.check_invite_milestones()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_count INTEGER;
  inviter_id UUID;
BEGIN
  -- Get the inviter from the invite
  SELECT i.inviter_id INTO inviter_id
  FROM public.invites i
  WHERE i.id = NEW.invite_id;

  -- Count total accepted invites for this user
  SELECT COUNT(DISTINCT ir.redeemer_id) INTO invite_count
  FROM public.invite_redemptions ir
  JOIN public.invites i ON ir.invite_id = i.id
  WHERE i.inviter_id = inviter_id;

  -- Award badges based on milestones
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

-- Create trigger for invite milestone checking
CREATE TRIGGER check_invite_milestones_trigger
AFTER INSERT ON public.invite_redemptions
FOR EACH ROW
EXECUTE FUNCTION public.check_invite_milestones();

-- Insert default community guidelines
INSERT INTO public.community_guidelines (version, content, is_current) VALUES
('1.0', '# VYBE Community Guidelines

Welcome to VYBE! To keep our community safe and enjoyable for everyone, please follow these guidelines:

## Be Respectful
- Treat others with kindness and respect
- No harassment, bullying, or hate speech
- No discrimination based on race, gender, sexuality, religion, or any other characteristic

## Keep Content Safe
- No explicit or adult content
- No violent or graphic content
- No content that promotes self-harm or dangerous activities

## Be Authentic
- No impersonation of others
- No spam or misleading content
- No scams or fraudulent activities

## Protect Privacy
- Do not share others'' personal information without consent
- Respect others'' privacy and boundaries

## Report Violations
If you see content that violates these guidelines, please report it using the report button.

Violations may result in warnings, content removal, temporary restrictions, or permanent bans.

Thank you for being part of VYBE! 💜', true);

-- Create index for analytics queries
CREATE INDEX idx_analytics_events_name_date ON public.analytics_events (event_name, created_at);
CREATE INDEX idx_analytics_events_user ON public.analytics_events (user_id, created_at);
CREATE INDEX idx_invites_code ON public.invites (invite_code);
CREATE INDEX idx_invite_redemptions_invite ON public.invite_redemptions (invite_id);