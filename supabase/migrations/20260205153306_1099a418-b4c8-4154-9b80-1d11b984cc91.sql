-- The issue is that challenge_progress.user_id = profile.id, but
-- challenge_rewards.user_id and user_levels.user_id reference auth.users(id)
-- We need to translate between them in the functions

-- First, change FK constraints on challenge_rewards and user_levels to be nullable temporarily
-- Actually, let's take a different approach: update challenge_progress to also use auth.users(id)
-- BUT triggers are passing profile.id, so we need a translation function

-- Create a helper function to get auth_id from profile_id (already exists, verify it works)
CREATE OR REPLACE FUNCTION public.get_auth_id_for_profile(_profile_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (SELECT user_id FROM public.profiles WHERE id = _profile_id AND user_id IS NOT NULL),
    _profile_id -- fallback: assume it's already an auth id
  )
$$;

-- Fix add_user_xp to translate profile_id to auth_id for user_levels table
CREATE OR REPLACE FUNCTION public.add_user_xp(p_user_id uuid, p_xp_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_auth_id UUID;
  v_old_level INTEGER;
  v_new_level INTEGER;
  v_new_xp INTEGER;
  v_level_up BOOLEAN := false;
  v_new_rewards JSONB := '[]'::jsonb;
BEGIN
  -- Translate profile_id to auth_id (p_user_id might be profile.id)
  v_auth_id := public.get_auth_id_for_profile(p_user_id);
  
  IF v_auth_id IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;
  
  -- Get or create user level record
  INSERT INTO public.user_levels (user_id, total_xp, current_level)
  VALUES (v_auth_id, 0, 1)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Get current state
  SELECT current_level, total_xp INTO v_old_level, v_new_xp
  FROM public.user_levels
  WHERE user_id = v_auth_id;
  
  v_old_level := COALESCE(v_old_level, 1);
  v_new_xp := COALESCE(v_new_xp, 0);
  
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
  WHERE user_id = v_auth_id;
  
  RETURN jsonb_build_object(
    'old_level', v_old_level,
    'new_level', v_new_level,
    'total_xp', v_new_xp,
    'level_up', v_level_up,
    'new_rewards', COALESCE(v_new_rewards, '[]'::jsonb)
  );
END;
$$;

-- Now challenge_progress stores profile.id, and challenge_rewards stores auth.users.id
-- We need to fix on_challenge_completed to translate
CREATE OR REPLACE FUNCTION public.on_challenge_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_challenge RECORD;
  v_auth_id UUID;
BEGIN
  -- Only process if just completed
  IF NEW.is_completed AND (OLD.is_completed IS NULL OR NOT OLD.is_completed) THEN
    -- NEW.user_id is profile.id, need to get auth_id for challenge_rewards
    v_auth_id := public.get_auth_id_for_profile(NEW.user_id);
    
    IF v_auth_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Get challenge details
    SELECT * INTO v_challenge
    FROM public.challenges
    WHERE id = NEW.challenge_id;
    
    IF FOUND THEN
      -- Create claimable reward using auth_id
      INSERT INTO public.challenge_rewards (
        user_id,
        challenge_id,
        xp_amount,
        badge_id
      )
      VALUES (
        v_auth_id,
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

-- Fix claim_challenge_reward to work with both ID types
CREATE OR REPLACE FUNCTION public.claim_challenge_reward(p_user_id uuid, p_reward_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_reward challenge_rewards%ROWTYPE;
  v_level_result json;
  v_auth_id uuid;
  v_profile_id uuid;
BEGIN
  -- p_user_id could be profile.id or auth.id, handle both
  v_auth_id := public.get_auth_id_for_profile(p_user_id);
  
  -- Get the reward (stored with auth_id)
  SELECT * INTO v_reward FROM challenge_rewards 
  WHERE id = p_reward_id AND user_id = v_auth_id AND is_claimed = false;
  
  IF v_reward IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Reward not found or already claimed');
  END IF;
  
  -- Mark as claimed
  UPDATE challenge_rewards 
  SET is_claimed = true, claimed_at = now()
  WHERE id = p_reward_id;
  
  -- Add XP (this function handles the translation)
  SELECT add_user_xp(p_user_id, v_reward.xp_amount) INTO v_level_result;
  
  RETURN json_build_object(
    'success', true,
    'xp_gained', v_reward.xp_amount,
    'level_result', v_level_result
  );
END;
$$;

-- Ensure messages table is in realtime publication for instant messaging
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

-- Ensure conversations table is in realtime for instant updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;

-- Ensure calls table is in realtime for call notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;
END $$;

-- Ensure challenge_progress is in realtime for instant challenge updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'challenge_progress'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.challenge_progress;
  END IF;
END $$;