-- Badge types enum (if not exists)
DO $$ BEGIN
  CREATE TYPE public.badge_category AS ENUM (
    'role',
    'patreon', 
    'referral',
    'challenge',
    'achievement',
    'beta',
    'special'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Badges table - stores all badge definitions
CREATE TABLE IF NOT EXISTS public.badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL,
  category badge_category NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  gradient_from TEXT,
  gradient_to TEXT,
  gradient_via TEXT,
  effect TEXT,
  is_animated BOOLEAN DEFAULT false,
  unlock_requirement TEXT,
  unlock_threshold INTEGER,
  is_staff_badge BOOLEAN DEFAULT false,
  can_be_disabled BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns to user_badges if they don't exist
DO $$ BEGIN
  ALTER TABLE public.user_badges ADD COLUMN IF NOT EXISTS badge_id UUID REFERENCES public.badges(id) ON DELETE CASCADE;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.user_badges ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.user_badges ADD COLUMN IF NOT EXISTS pin_order INTEGER;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.user_badges ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.user_badges ADD COLUMN IF NOT EXISTS show_effect BOOLEAN DEFAULT true;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.user_badges ADD COLUMN IF NOT EXISTS earned_at TIMESTAMPTZ DEFAULT now();
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.user_badges ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.user_badges ADD COLUMN IF NOT EXISTS awarded_by UUID REFERENCES public.profiles(id);
EXCEPTION WHEN others THEN NULL;
END $$;

-- Challenges table
CREATE TABLE IF NOT EXISTS public.challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('daily', 'weekly', 'achievement')),
  requirement_type TEXT NOT NULL,
  requirement_count INTEGER DEFAULT 1,
  reward_badge_id UUID REFERENCES public.badges(id),
  reward_xp INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Challenge progress tracking
CREATE TABLE IF NOT EXISTS public.challenge_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  current_count INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, challenge_id)
);

-- Enable RLS
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_progress ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Anyone can view active badges" ON public.badges;
DROP POLICY IF EXISTS "Admins can manage badges" ON public.badges;
DROP POLICY IF EXISTS "Anyone can view active challenges" ON public.challenges;
DROP POLICY IF EXISTS "Admins can manage challenges" ON public.challenges;
DROP POLICY IF EXISTS "Users can view own challenge progress" ON public.challenge_progress;
DROP POLICY IF EXISTS "Users can update own challenge progress" ON public.challenge_progress;

-- Badges policies
CREATE POLICY "Anyone can view active badges"
ON public.badges FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage badges"
ON public.badges FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Challenges policies
CREATE POLICY "Anyone can view active challenges"
ON public.challenges FOR SELECT
TO authenticated
USING (is_active = true);

CREATE POLICY "Admins can manage challenges"
ON public.challenges FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Challenge progress policies
CREATE POLICY "Users can view own challenge progress"
ON public.challenge_progress FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own challenge progress"
ON public.challenge_progress FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Insert default badges
INSERT INTO public.badges (name, description, icon, category, priority, gradient_from, gradient_to, effect, is_animated, is_staff_badge, can_be_disabled) VALUES
('Owner', 'App Owner', '👑', 'role', 1, '45 100% 60%', '35 100% 50%', 'shine', true, true, false),
('Admin', 'Administrator', '🛡️', 'role', 2, '0 85% 55%', '350 90% 45%', 'pulse', true, true, false),
('Moderator', 'Community Moderator', '⚔️', 'role', 3, '220 10% 70%', '220 15% 55%', 'glow', false, true, false),
('Founder', 'VYBE Founder Supporter', '💎', 'patreon', 10, '330 85% 60%', '270 85% 55%', 'shimmer', true, false, true),
('Beta Crew', 'Early Beta Supporter', '🚀', 'patreon', 11, '190 95% 55%', '220 90% 50%', 'glow', false, false, true),
('Architect', 'VYBE Architect', '🏗️', 'patreon', 12, '270 80% 55%', '190 85% 50%', 'shimmer', true, false, true),
('Legend', 'VYBE Legend', '⭐', 'patreon', 13, '45 95% 55%', '190 90% 50%', 'shimmer', true, false, true),
('Recruiter', 'Invited 1 friend', '🤝', 'referral', 50, '150 70% 50%', '120 65% 45%', NULL, false, false, true),
('Ambassador', 'Invited 5 friends', '📣', 'referral', 51, '200 75% 55%', '180 70% 50%', 'glow', false, false, true),
('Influencer', 'Invited 10 friends', '🌟', 'referral', 52, '280 80% 55%', '320 75% 50%', 'shimmer', false, false, true),
('Viral', 'Invited 25 friends', '🔥', 'referral', 53, '25 95% 55%', '0 90% 50%', 'pulse', true, false, true),
('Legendary Recruiter', 'Invited 50 friends', '👑', 'referral', 54, '45 100% 60%', '30 95% 50%', 'shine', true, false, true),
('First Post', 'Created your first post', '📝', 'achievement', 100, NULL, NULL, NULL, false, false, true),
('Conversation Starter', 'Started 10 conversations', '💬', 'achievement', 101, NULL, NULL, NULL, false, false, true),
('Night Owl', 'Active between 12am-5am', '🦉', 'achievement', 102, '260 70% 50%', '280 65% 45%', 'glow', false, false, true),
('Early Bird', 'Active before 6am', '🐦', 'achievement', 103, '45 80% 55%', '30 75% 50%', NULL, false, false, true),
('Beta Tester', 'Participated in VYBE Beta', '🧪', 'beta', 80, '280 75% 55%', '320 70% 50%', 'glow', false, false, true),
('Bug Hunter', 'Reported bugs during beta', '🐛', 'beta', 81, '120 70% 50%', '150 65% 45%', NULL, false, false, true)
ON CONFLICT DO NOTHING;

-- Insert default challenges
INSERT INTO public.challenges (title, description, type, requirement_type, requirement_count, reward_xp) VALUES
('First Steps', 'Complete your profile setup', 'achievement', 'complete_profile', 1, 100),
('Social Butterfly', 'Start a conversation with 5 different people', 'weekly', 'new_conversation', 5, 50),
('Daily Check-in', 'Open the app today', 'daily', 'login', 1, 10),
('Share the Love', 'Invite a friend to VYBE', 'achievement', 'invite', 1, 75),
('Content Creator', 'Create 3 posts this week', 'weekly', 'post', 3, 60),
('Engaged', 'Leave 10 comments', 'weekly', 'comment', 10, 40)
ON CONFLICT DO NOTHING;

-- Function to get user's highest priority badge
CREATE OR REPLACE FUNCTION public.get_user_primary_badge(p_user_id UUID)
RETURNS TABLE (
  badge_id UUID,
  name TEXT,
  icon TEXT,
  gradient_from TEXT,
  gradient_to TEXT,
  gradient_via TEXT,
  effect TEXT,
  is_animated BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.icon,
    b.gradient_from,
    b.gradient_to,
    b.gradient_via,
    b.effect,
    b.is_animated
  FROM public.user_badges ub
  JOIN public.badges b ON b.id = ub.badge_id
  WHERE ub.user_id = p_user_id
    AND b.is_active = true
    AND (ub.expires_at IS NULL OR ub.expires_at > now())
    AND (ub.show_effect = true OR b.is_staff_badge = true)
  ORDER BY b.priority ASC
  LIMIT 1;
END;
$$;

-- Function to award badge to user
CREATE OR REPLACE FUNCTION public.award_badge(
  p_user_id UUID,
  p_badge_id UUID,
  p_awarded_by UUID DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.user_badges (user_id, badge_id, awarded_by, expires_at)
  VALUES (p_user_id, p_badge_id, p_awarded_by, p_expires_at)
  ON CONFLICT (user_id, badge_id) DO UPDATE SET
    expires_at = COALESCE(p_expires_at, user_badges.expires_at),
    awarded_by = COALESCE(p_awarded_by, user_badges.awarded_by)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_badges;
ALTER PUBLICATION supabase_realtime ADD TABLE public.challenge_progress;