-- Enable realtime for challenge tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.challenge_rewards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.challenge_progress;

-- Create the main function to increment challenge progress
CREATE OR REPLACE FUNCTION increment_challenge_progress(
  p_user_id uuid,
  p_requirement_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_challenge RECORD;
  v_current_count int;
  v_is_completed boolean;
BEGIN
  -- Find all active challenges matching this requirement type
  FOR v_challenge IN 
    SELECT id, requirement_count, reward_badge_id, reward_xp
    FROM challenges 
    WHERE is_active = true 
    AND requirement_type = p_requirement_type
  LOOP
    -- Get current progress
    SELECT current_count, is_completed INTO v_current_count, v_is_completed
    FROM challenge_progress
    WHERE user_id = p_user_id AND challenge_id = v_challenge.id;
    
    -- Skip if already completed
    IF v_is_completed IS TRUE THEN
      CONTINUE;
    END IF;
    
    v_current_count := COALESCE(v_current_count, 0) + 1;
    v_is_completed := v_current_count >= v_challenge.requirement_count;
    
    -- Upsert progress (on_challenge_completed trigger handles reward creation)
    INSERT INTO challenge_progress (user_id, challenge_id, current_count, is_completed, completed_at, updated_at)
    VALUES (
      p_user_id, 
      v_challenge.id, 
      v_current_count, 
      v_is_completed,
      CASE WHEN v_is_completed THEN now() ELSE NULL END,
      now()
    )
    ON CONFLICT (user_id, challenge_id) 
    DO UPDATE SET 
      current_count = EXCLUDED.current_count,
      is_completed = EXCLUDED.is_completed,
      completed_at = CASE WHEN EXCLUDED.is_completed AND challenge_progress.completed_at IS NULL THEN now() ELSE challenge_progress.completed_at END,
      updated_at = now()
    WHERE NOT challenge_progress.is_completed;
  END LOOP;
END;
$$;

-- Posts trigger
CREATE OR REPLACE FUNCTION on_post_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM increment_challenge_progress(NEW.author_id, 'post');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_post_challenge ON posts;
CREATE TRIGGER trigger_post_challenge
AFTER INSERT ON posts
FOR EACH ROW
EXECUTE FUNCTION on_post_created();

-- Comments trigger  
CREATE OR REPLACE FUNCTION on_comment_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM increment_challenge_progress(NEW.user_id, 'comment');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_comment_challenge ON comments;
CREATE TRIGGER trigger_comment_challenge
AFTER INSERT ON comments
FOR EACH ROW
EXECUTE FUNCTION on_comment_created();

-- Messages trigger
CREATE OR REPLACE FUNCTION on_message_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM increment_challenge_progress(NEW.sender_id, 'message');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_message_challenge ON messages;
CREATE TRIGGER trigger_message_challenge
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION on_message_sent();

-- Likes trigger
CREATE OR REPLACE FUNCTION on_like_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM increment_challenge_progress(NEW.user_id, 'like');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_like_challenge ON likes;
CREATE TRIGGER trigger_like_challenge
AFTER INSERT ON likes
FOR EACH ROW
EXECUTE FUNCTION on_like_created();

-- Follows trigger
CREATE OR REPLACE FUNCTION on_follow_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Follower gets credit for following someone
  PERFORM increment_challenge_progress(NEW.follower_id, 'follow');
  -- Followee gets credit for gaining a follower
  PERFORM increment_challenge_progress(NEW.following_id, 'follower');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_follow_challenge ON follows;
CREATE TRIGGER trigger_follow_challenge
AFTER INSERT ON follows
FOR EACH ROW
EXECUTE FUNCTION on_follow_created();

-- Conversation member trigger (for new_conversation)
CREATE OR REPLACE FUNCTION on_conversation_joined()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM increment_challenge_progress(NEW.user_id, 'new_conversation');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_conversation_challenge ON conversation_members;
CREATE TRIGGER trigger_conversation_challenge
AFTER INSERT ON conversation_members
FOR EACH ROW
EXECUTE FUNCTION on_conversation_joined();

-- Daily login tracking function
CREATE OR REPLACE FUNCTION track_daily_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_last_login date;
BEGIN
  -- Get profile ID from auth
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN; END IF;
  
  -- Check last login date for login-type daily challenges
  SELECT DATE(cp.updated_at) INTO v_last_login
  FROM challenge_progress cp
  JOIN challenges c ON c.id = cp.challenge_id
  WHERE cp.user_id = v_profile_id 
  AND c.requirement_type = 'login'
  AND c.type = 'daily'
  ORDER BY cp.updated_at DESC
  LIMIT 1;
  
  -- Only credit if hasn't logged in today
  IF v_last_login IS NULL OR v_last_login < CURRENT_DATE THEN
    PERFORM increment_challenge_progress(v_profile_id, 'login');
  END IF;
END;
$$;