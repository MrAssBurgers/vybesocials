-- Improve sync_my_challenge_progress to properly sync retroactive challenge progress
-- and award badges when challenges are completed

CREATE OR REPLACE FUNCTION sync_my_challenge_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_profile_id uuid;
  v_challenge RECORD;
  v_current_count int;
  v_is_completed boolean;
BEGIN
  -- Get the authenticated user's auth ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Get the profile ID (may be different from auth user_id)
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = v_user_id;
  IF v_profile_id IS NULL THEN
    -- Fallback: try direct match on id
    SELECT id INTO v_profile_id FROM profiles WHERE id = v_user_id;
  END IF;
  
  IF v_profile_id IS NULL THEN
    RETURN; -- No profile found
  END IF;

  -- Loop through all active challenges and sync progress
  FOR v_challenge IN 
    SELECT id, requirement_type, requirement_count, reward_badge_id, reward_xp
    FROM challenges 
    WHERE is_active = true
  LOOP
    v_current_count := 0;
    
    -- Calculate current count based on requirement type
    CASE v_challenge.requirement_type
      WHEN 'post' THEN
        SELECT COUNT(*) INTO v_current_count FROM posts WHERE author_id = v_profile_id;
      WHEN 'comment' THEN
        SELECT COUNT(*) INTO v_current_count FROM comments WHERE user_id = v_profile_id;
      WHEN 'like' THEN
        SELECT COUNT(*) INTO v_current_count FROM likes WHERE user_id = v_profile_id;
      WHEN 'follow' THEN
        SELECT COUNT(*) INTO v_current_count FROM follows WHERE follower_id = v_profile_id;
      WHEN 'follower' THEN
        SELECT COUNT(*) INTO v_current_count FROM follows WHERE following_id = v_profile_id;
      WHEN 'invite' THEN
        SELECT COUNT(*) INTO v_current_count FROM referrals WHERE referrer_id = v_profile_id AND confirmed = true;
      WHEN 'new_conversation' THEN
        SELECT COUNT(*) INTO v_current_count FROM conversation_members WHERE user_id = v_profile_id;
      WHEN 'message' THEN
        SELECT COUNT(*) INTO v_current_count FROM messages WHERE sender_id = v_profile_id;
      WHEN 'login' THEN
        -- For login challenges, just mark as 1 since they logged in
        v_current_count := 1;
      WHEN 'complete_profile' THEN
        -- Check if profile has basic fields filled
        SELECT CASE 
          WHEN avatar_url IS NOT NULL AND display_name IS NOT NULL THEN 1 
          ELSE 0 
        END INTO v_current_count
        FROM profiles WHERE id = v_profile_id;
      ELSE
        v_current_count := 0;
    END CASE;
    
    v_is_completed := v_current_count >= v_challenge.requirement_count;
    
    -- Upsert challenge progress
    INSERT INTO challenge_progress (user_id, challenge_id, current_count, is_completed, completed_at, updated_at)
    VALUES (
      v_profile_id, 
      v_challenge.id, 
      v_current_count, 
      v_is_completed,
      CASE WHEN v_is_completed THEN now() ELSE NULL END,
      now()
    )
    ON CONFLICT (user_id, challenge_id) 
    DO UPDATE SET 
      current_count = GREATEST(challenge_progress.current_count, EXCLUDED.current_count),
      is_completed = EXCLUDED.is_completed OR challenge_progress.is_completed,
      completed_at = COALESCE(challenge_progress.completed_at, EXCLUDED.completed_at),
      updated_at = now();
    
    -- If challenge is now completed and has a badge reward, award the badge
    IF v_is_completed AND v_challenge.reward_badge_id IS NOT NULL THEN
      -- Award badge using the auth user_id (for user_badges table)
      INSERT INTO user_badges (user_id, badge_id)
      VALUES (v_user_id, v_challenge.reward_badge_id)
      ON CONFLICT (user_id, badge_id) DO NOTHING;
    END IF;
    
    -- Create challenge reward entry if completed (for XP claiming)
    IF v_is_completed THEN
      INSERT INTO challenge_rewards (user_id, challenge_id, xp_amount, badge_id, is_claimed)
      VALUES (v_profile_id, v_challenge.id, COALESCE(v_challenge.reward_xp, 0), v_challenge.reward_badge_id, false)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;