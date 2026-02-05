-- Drop the function with wrong return type first
DROP FUNCTION IF EXISTS claim_challenge_reward(uuid, uuid);

-- Recreate claim_challenge_reward with proper return type
CREATE OR REPLACE FUNCTION claim_challenge_reward(
  p_user_id uuid,
  p_reward_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_reward challenge_rewards%ROWTYPE;
  v_level_result json;
  v_auth_id uuid;
BEGIN
  -- Get auth user id
  SELECT user_id INTO v_auth_id FROM profiles WHERE id = p_user_id;
  
  -- Get the reward
  SELECT * INTO v_reward FROM challenge_rewards 
  WHERE id = p_reward_id AND user_id = p_user_id AND is_claimed = false;
  
  IF v_reward IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Reward not found or already claimed');
  END IF;
  
  -- Mark as claimed
  UPDATE challenge_rewards 
  SET is_claimed = true, claimed_at = now()
  WHERE id = p_reward_id;
  
  -- Add XP and check for level up
  SELECT add_user_xp(p_user_id, v_reward.xp_amount) INTO v_level_result;
  
  RETURN json_build_object(
    'success', true,
    'xp_gained', v_reward.xp_amount,
    'level_result', v_level_result
  );
END;
$$;