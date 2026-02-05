-- 1. Add Profile Update Trigger for complete_profile challenge
CREATE OR REPLACE FUNCTION on_profile_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Check if profile is now "complete" (has avatar_url OR display_name OR bio)
  -- Only trigger if it wasn't complete before
  IF (NEW.avatar_url IS NOT NULL OR NEW.display_name IS NOT NULL OR (NEW.bio IS NOT NULL AND LENGTH(NEW.bio) > 0))
     AND (OLD.avatar_url IS NULL AND OLD.display_name IS NULL AND (OLD.bio IS NULL OR LENGTH(OLD.bio) = 0)) THEN
    PERFORM increment_challenge_progress(NEW.id, 'complete_profile');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_profile_challenge ON profiles;
CREATE TRIGGER trigger_profile_challenge
AFTER UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION on_profile_updated();

-- 2. Update sync_my_challenge_progress to use lenient profile check (skip invite since referrals table doesn't exist)
CREATE OR REPLACE FUNCTION sync_my_challenge_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_auth_id uuid;
  v_profile_id uuid;
  v_challenge RECORD;
  v_current_count integer;
  v_is_completed boolean;
BEGIN
  v_auth_id := auth.uid();
  IF v_auth_id IS NULL THEN
    RETURN;
  END IF;
  
  SELECT id INTO v_profile_id FROM profiles WHERE id = v_auth_id;
  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;
  
  FOR v_challenge IN 
    SELECT * FROM challenges WHERE is_active = true
  LOOP
    v_current_count := 0;
    
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
      WHEN 'message' THEN
        SELECT COUNT(*) INTO v_current_count FROM messages WHERE sender_id = v_profile_id;
      WHEN 'new_conversation' THEN
        SELECT COUNT(*) INTO v_current_count FROM conversations WHERE created_by = v_profile_id;
      WHEN 'complete_profile' THEN
        -- Lenient check: any of avatar, display_name, or bio
        SELECT CASE 
          WHEN avatar_url IS NOT NULL 
            OR display_name IS NOT NULL 
            OR (bio IS NOT NULL AND LENGTH(bio) > 0) 
          THEN 1 
          ELSE 0 
        END INTO v_current_count
        FROM profiles WHERE id = v_profile_id;
      WHEN 'invite' THEN
        -- Skip invite tracking for now (referrals table doesn't exist)
        CONTINUE;
      WHEN 'login' THEN
        -- Login is handled by track_daily_login, skip here
        CONTINUE;
      ELSE
        CONTINUE;
    END CASE;
    
    v_is_completed := v_current_count >= v_challenge.requirement_count;
    
    -- Only update if there's actual progress
    IF v_current_count > 0 THEN
      INSERT INTO challenge_progress (user_id, challenge_id, current_count, is_completed, completed_at, updated_at)
      VALUES (
        v_profile_id, 
        v_challenge.id, 
        v_current_count, 
        v_is_completed,
        CASE WHEN v_is_completed THEN now() ELSE NULL END,
        now()
      )
      ON CONFLICT (user_id, challenge_id) DO UPDATE SET
        current_count = GREATEST(challenge_progress.current_count, EXCLUDED.current_count),
        is_completed = challenge_progress.is_completed OR EXCLUDED.is_completed,
        completed_at = COALESCE(challenge_progress.completed_at, EXCLUDED.completed_at),
        updated_at = now()
      WHERE NOT challenge_progress.is_completed;
      
      -- Create reward if newly completed
      IF v_is_completed THEN
        INSERT INTO challenge_rewards (user_id, challenge_id, badge_id, xp_amount, is_claimed)
        VALUES (v_profile_id, v_challenge.id, v_challenge.reward_badge_id, COALESCE(v_challenge.reward_xp, 0), false)
        ON CONFLICT DO NOTHING;
        
        -- Auto-grant badge if applicable
        IF v_challenge.reward_badge_id IS NOT NULL THEN
          INSERT INTO user_badges (user_id, badge_id, is_active)
          VALUES (v_auth_id, v_challenge.reward_badge_id, true)
          ON CONFLICT (user_id, badge_id) DO NOTHING;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- 3. Create force_sync_my_challenges RPC
CREATE OR REPLACE FUNCTION force_sync_my_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM sync_my_challenge_progress();
END;
$$;