-- Function to sync retroactive challenge progress based on user's actual activity
CREATE OR REPLACE FUNCTION sync_user_challenge_progress(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge RECORD;
  v_count INTEGER;
  v_is_completed BOOLEAN;
BEGIN
  FOR v_challenge IN 
    SELECT * FROM challenges WHERE is_active = true
  LOOP
    v_count := 0;
    
    -- Calculate actual progress based on requirement_type
    CASE v_challenge.requirement_type
      WHEN 'posts_created' THEN
        SELECT COUNT(*) INTO v_count FROM posts WHERE user_id = p_user_id;
      WHEN 'comments_made' THEN
        SELECT COUNT(*) INTO v_count FROM comments WHERE user_id = p_user_id;
      WHEN 'friends_added' THEN
        SELECT COUNT(*) INTO v_count FROM friends WHERE (user_id = p_user_id OR friend_id = p_user_id) AND status = 'accepted';
      WHEN 'messages_sent' THEN
        SELECT COUNT(*) INTO v_count FROM messages WHERE sender_id = p_user_id;
      WHEN 'profile_complete' THEN
        SELECT CASE 
          WHEN display_name IS NOT NULL AND avatar_url IS NOT NULL AND bio IS NOT NULL 
          THEN 1 ELSE 0 END INTO v_count
        FROM profiles WHERE id = p_user_id;
      WHEN 'referrals_made' THEN
        SELECT invite_count INTO v_count FROM profiles WHERE id = p_user_id;
      WHEN 'stories_posted' THEN
        SELECT COUNT(*) INTO v_count FROM stories WHERE user_id = p_user_id;
      WHEN 'likes_given' THEN
        SELECT COUNT(*) INTO v_count FROM likes WHERE user_id = p_user_id;
      WHEN 'streak_days' THEN
        SELECT COALESCE(MAX(current_streak), 0) INTO v_count FROM streaks WHERE user_id = p_user_id;
      ELSE
        v_count := 0;
    END CASE;
    
    v_is_completed := v_count >= v_challenge.requirement_count;
    
    -- Upsert progress
    INSERT INTO challenge_progress (user_id, challenge_id, current_count, is_completed, completed_at)
    VALUES (
      p_user_id, 
      v_challenge.id, 
      LEAST(v_count, v_challenge.requirement_count),
      v_is_completed,
      CASE WHEN v_is_completed THEN NOW() ELSE NULL END
    )
    ON CONFLICT (user_id, challenge_id) 
    DO UPDATE SET 
      current_count = GREATEST(challenge_progress.current_count, EXCLUDED.current_count),
      is_completed = EXCLUDED.is_completed OR challenge_progress.is_completed,
      completed_at = COALESCE(challenge_progress.completed_at, EXCLUDED.completed_at),
      updated_at = NOW()
    WHERE NOT challenge_progress.is_completed;
    
    -- Create reward if newly completed and doesn't exist
    IF v_is_completed THEN
      INSERT INTO challenge_rewards (user_id, challenge_id, xp_amount, badge_id, is_claimed)
      VALUES (
        p_user_id,
        v_challenge.id,
        COALESCE(v_challenge.reward_xp, 50),
        v_challenge.reward_badge_id,
        false
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Function to grant all badges to owner
CREATE OR REPLACE FUNCTION grant_owner_all_badges(p_owner_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_badge RECORD;
BEGIN
  FOR v_badge IN SELECT * FROM badges WHERE is_active = true
  LOOP
    INSERT INTO user_badges (user_id, badge_id, is_pinned, show_effect)
    VALUES (p_owner_user_id, v_badge.id, false, true)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
  END LOOP;
  
  -- Also max out the owner's level
  INSERT INTO user_levels (user_id, current_xp, current_level)
  VALUES (p_owner_user_id, 999999, 100)
  ON CONFLICT (user_id) 
  DO UPDATE SET current_xp = 999999, current_level = 100;
  
  -- Complete all challenges for owner
  INSERT INTO challenge_progress (user_id, challenge_id, current_count, is_completed, completed_at)
  SELECT 
    p_owner_user_id,
    id,
    requirement_count,
    true,
    NOW()
  FROM challenges
  ON CONFLICT (user_id, challenge_id) 
  DO UPDATE SET 
    current_count = EXCLUDED.current_count,
    is_completed = true,
    completed_at = COALESCE(challenge_progress.completed_at, NOW());
END;
$$;

-- RPC wrapper for sync
CREATE OR REPLACE FUNCTION sync_my_challenge_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM sync_user_challenge_progress(auth.uid());
END;
$$;

-- RPC wrapper for owner badge grant (checks if caller is owner by username)
CREATE OR REPLACE FUNCTION check_and_grant_owner_badges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username TEXT;
BEGIN
  SELECT username INTO v_username FROM profiles WHERE id = auth.uid();
  
  IF LOWER(TRIM(v_username)) = 'mrassburgers' THEN
    PERFORM grant_owner_all_badges(auth.uid());
  END IF;
END;
$$;