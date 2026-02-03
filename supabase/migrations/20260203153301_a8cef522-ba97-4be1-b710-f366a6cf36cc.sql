-- User XP and Level tracking table
CREATE TABLE public.user_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_xp INTEGER NOT NULL DEFAULT 0,
  current_level INTEGER NOT NULL DEFAULT 1,
  unclaimed_rewards JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Battle Pass Tiers / Level Rewards
CREATE TABLE public.battle_pass_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level INTEGER NOT NULL UNIQUE,
  xp_required INTEGER NOT NULL,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('badge', 'cosmetic', 'effect', 'title')),
  reward_id UUID, -- Reference to badge if badge reward
  reward_name TEXT NOT NULL,
  reward_description TEXT,
  reward_icon TEXT NOT NULL DEFAULT '🎁',
  is_premium BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Challenge completion notifications (for realtime)
CREATE TABLE public.challenge_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  xp_amount INTEGER NOT NULL,
  badge_id UUID REFERENCES public.badges(id),
  is_claimed BOOLEAN NOT NULL DEFAULT false,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, challenge_id)
);

-- Enable RLS
ALTER TABLE public.user_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_pass_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_rewards ENABLE ROW LEVEL SECURITY;

-- Policies for user_levels
CREATE POLICY "Users can view their own level" ON public.user_levels
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view all levels for leaderboard" ON public.user_levels
  FOR SELECT USING (true);

CREATE POLICY "System can manage user levels" ON public.user_levels
  FOR ALL USING (true);

-- Policies for battle_pass_tiers (public read)
CREATE POLICY "Anyone can view battle pass tiers" ON public.battle_pass_tiers
  FOR SELECT USING (true);

-- Policies for challenge_rewards
CREATE POLICY "Users can view their own rewards" ON public.challenge_rewards
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can claim their own rewards" ON public.challenge_rewards
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "System can create rewards" ON public.challenge_rewards
  FOR INSERT WITH CHECK (true);

-- Enable realtime for instant notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.challenge_rewards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_levels;

-- Function to calculate level from XP
CREATE OR REPLACE FUNCTION public.calculate_level_from_xp(p_xp INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_level INTEGER;
BEGIN
  -- Level formula: each level requires more XP (100 * level)
  -- Level 1: 0-99, Level 2: 100-299, Level 3: 300-599, etc.
  SELECT COALESCE(MAX(level), 1) INTO v_level
  FROM public.battle_pass_tiers
  WHERE xp_required <= p_xp;
  
  -- Fallback calculation if no tiers defined
  IF v_level IS NULL OR v_level < 1 THEN
    v_level := GREATEST(1, FLOOR(SQRT(p_xp / 50.0))::INTEGER);
  END IF;
  
  RETURN v_level;
END;
$$;

-- Function to add XP and check for level ups
CREATE OR REPLACE FUNCTION public.add_user_xp(
  p_user_id UUID,
  p_xp_amount INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_level INTEGER;
  v_new_level INTEGER;
  v_new_xp INTEGER;
  v_level_up BOOLEAN := false;
  v_new_rewards JSONB := '[]'::jsonb;
BEGIN
  -- Get or create user level record
  INSERT INTO public.user_levels (user_id, total_xp, current_level)
  VALUES (p_user_id, 0, 1)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Get current state
  SELECT current_level, total_xp INTO v_old_level, v_new_xp
  FROM public.user_levels
  WHERE user_id = p_user_id;
  
  -- Add XP
  v_new_xp := v_new_xp + p_xp_amount;
  v_new_level := public.calculate_level_from_xp(v_new_xp);
  v_level_up := v_new_level > v_old_level;
  
  -- Get new rewards if leveled up
  IF v_level_up THEN
    SELECT jsonb_agg(jsonb_build_object(
      'level', level,
      'reward_type', reward_type,
      'reward_id', reward_id,
      'reward_name', reward_name,
      'reward_icon', reward_icon
    ))
    INTO v_new_rewards
    FROM public.battle_pass_tiers
    WHERE level > v_old_level AND level <= v_new_level AND NOT is_premium;
  END IF;
  
  -- Update user level
  UPDATE public.user_levels
  SET 
    total_xp = v_new_xp,
    current_level = v_new_level,
    unclaimed_rewards = COALESCE(unclaimed_rewards, '[]'::jsonb) || COALESCE(v_new_rewards, '[]'::jsonb),
    updated_at = now()
  WHERE user_id = p_user_id;
  
  RETURN jsonb_build_object(
    'old_level', v_old_level,
    'new_level', v_new_level,
    'total_xp', v_new_xp,
    'level_up', v_level_up,
    'new_rewards', COALESCE(v_new_rewards, '[]'::jsonb)
  );
END;
$$;

-- Function to claim challenge reward
CREATE OR REPLACE FUNCTION public.claim_challenge_reward(
  p_user_id UUID,
  p_reward_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward RECORD;
  v_xp_result JSONB;
BEGIN
  -- Get the reward
  SELECT * INTO v_reward
  FROM public.challenge_rewards
  WHERE id = p_reward_id AND user_id = p_user_id AND NOT is_claimed;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reward not found or already claimed');
  END IF;
  
  -- Mark as claimed
  UPDATE public.challenge_rewards
  SET is_claimed = true, claimed_at = now()
  WHERE id = p_reward_id;
  
  -- Add XP
  v_xp_result := public.add_user_xp(p_user_id, v_reward.xp_amount);
  
  -- Award badge if present
  IF v_reward.badge_id IS NOT NULL THEN
    PERFORM public.award_badge(p_user_id, v_reward.badge_id, NULL);
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'xp_gained', v_reward.xp_amount,
    'level_result', v_xp_result
  );
END;
$$;

-- Trigger to create reward when challenge is completed
CREATE OR REPLACE FUNCTION public.on_challenge_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge RECORD;
BEGIN
  -- Only process if just completed
  IF NEW.is_completed AND (OLD.is_completed IS NULL OR NOT OLD.is_completed) THEN
    -- Get challenge details
    SELECT * INTO v_challenge
    FROM public.challenges
    WHERE id = NEW.challenge_id;
    
    IF FOUND THEN
      -- Create claimable reward
      INSERT INTO public.challenge_rewards (
        user_id,
        challenge_id,
        xp_amount,
        badge_id
      )
      VALUES (
        NEW.user_id,
        NEW.challenge_id,
        COALESCE(v_challenge.reward_xp, 0),
        v_challenge.reward_badge_id
      )
      ON CONFLICT (user_id, challenge_id) DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_challenge_completed
  AFTER INSERT OR UPDATE ON public.challenge_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.on_challenge_completed();

-- Insert default battle pass tiers
INSERT INTO public.battle_pass_tiers (level, xp_required, reward_type, reward_name, reward_description, reward_icon) VALUES
(1, 0, 'title', 'Newcomer', 'Your journey begins!', '🌱'),
(2, 100, 'cosmetic', 'Blue Glow', 'Subtle blue glow effect', '💙'),
(3, 250, 'effect', 'Sparkle', 'Sparkle animation for name', '✨'),
(4, 500, 'cosmetic', 'Purple Aura', 'Purple aura effect', '💜'),
(5, 800, 'title', 'Rising Star', 'You are making progress!', '⭐'),
(6, 1200, 'effect', 'Rainbow Shift', 'Slow rainbow gradient', '🌈'),
(7, 1700, 'cosmetic', 'Gold Frame', 'Gold profile frame', '🏅'),
(8, 2300, 'title', 'Veteran', 'A seasoned VYBE user', '🎖️'),
(9, 3000, 'effect', 'Fire Trail', 'Animated fire effect', '🔥'),
(10, 4000, 'title', 'Legend', 'You have achieved greatness!', '👑'),
(15, 7500, 'cosmetic', 'Diamond Frame', 'Exclusive diamond frame', '💎'),
(20, 12000, 'title', 'VYBE Master', 'The ultimate achievement', '🏆'),
(25, 18000, 'effect', 'Cosmic Glow', 'Animated cosmic effect', '🌌'),
(50, 50000, 'title', 'VYBE God', 'Legendary status', '⚡');
