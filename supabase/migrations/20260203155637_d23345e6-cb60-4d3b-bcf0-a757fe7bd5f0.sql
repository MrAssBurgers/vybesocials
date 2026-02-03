
-- Update challenges with their corresponding badges and fix requirement types
-- Link First Post badge to the Content Creator challenge (posts)
UPDATE challenges 
SET reward_badge_id = (SELECT id FROM badges WHERE name = 'First Post' LIMIT 1)
WHERE title = 'Content Creator' AND reward_badge_id IS NULL;

-- Link Conversation Starter badge to Social Butterfly (new_conversation)
UPDATE challenges 
SET reward_badge_id = (SELECT id FROM badges WHERE name = 'Conversation Starter' LIMIT 1)
WHERE title = 'Social Butterfly' AND reward_badge_id IS NULL;

-- Link Recruiter badge to Share the Love (invite/referral)
UPDATE challenges 
SET reward_badge_id = (SELECT id FROM badges WHERE name = 'Recruiter' LIMIT 1)
WHERE title = 'Share the Love' AND reward_badge_id IS NULL;

-- Update sync_user_challenge_progress to handle more requirement types
CREATE OR REPLACE FUNCTION public.sync_user_challenge_progress(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_challenge RECORD;
  v_count INTEGER;
  v_is_completed BOOLEAN;
  v_badge_awarded BOOLEAN;
BEGIN
  FOR v_challenge IN 
    SELECT * FROM challenges WHERE is_active = true
  LOOP
    v_count := 0;
    
    -- Calculate actual progress based on requirement_type
    CASE v_challenge.requirement_type
      -- Posts
      WHEN 'posts_created' THEN
        SELECT COUNT(*) INTO v_count FROM posts WHERE user_id = p_user_id;
      WHEN 'post' THEN
        SELECT COUNT(*) INTO v_count FROM posts WHERE user_id = p_user_id;
      -- Comments
      WHEN 'comments_made' THEN
        SELECT COUNT(*) INTO v_count FROM comments WHERE user_id = p_user_id;
      WHEN 'comment' THEN
        SELECT COUNT(*) INTO v_count FROM comments WHERE user_id = p_user_id;
      -- Friends
      WHEN 'friends_added' THEN
        SELECT COUNT(*) INTO v_count FROM friends WHERE (user_id = p_user_id OR friend_id = p_user_id) AND status = 'accepted';
      -- Messages
      WHEN 'messages_sent' THEN
        SELECT COUNT(*) INTO v_count FROM messages WHERE sender_id = p_user_id;
      -- Profile
      WHEN 'profile_complete' THEN
        SELECT CASE 
          WHEN display_name IS NOT NULL AND avatar_url IS NOT NULL AND bio IS NOT NULL 
          THEN 1 ELSE 0 END INTO v_count
        FROM profiles WHERE id = p_user_id;
      WHEN 'complete_profile' THEN
        SELECT CASE 
          WHEN display_name IS NOT NULL AND avatar_url IS NOT NULL AND bio IS NOT NULL 
          THEN 1 ELSE 0 END INTO v_count
        FROM profiles WHERE id = p_user_id;
      -- Referrals
      WHEN 'referrals_made' THEN
        SELECT COALESCE(invite_count, 0) INTO v_count FROM profiles WHERE id = p_user_id;
      WHEN 'invite' THEN
        SELECT COALESCE(invite_count, 0) INTO v_count FROM profiles WHERE id = p_user_id;
      -- Stories
      WHEN 'stories_posted' THEN
        SELECT COUNT(*) INTO v_count FROM stories WHERE user_id = p_user_id;
      -- Likes
      WHEN 'likes_given' THEN
        SELECT COUNT(*) INTO v_count FROM likes WHERE user_id = p_user_id;
      -- Streaks
      WHEN 'streak_days' THEN
        SELECT COALESCE(MAX(current_streak), 0) INTO v_count FROM streaks WHERE user_id = p_user_id;
      -- Conversations
      WHEN 'new_conversation' THEN
        SELECT COUNT(DISTINCT cm.conversation_id) INTO v_count 
        FROM conversation_members cm 
        WHERE cm.user_id = p_user_id;
      -- Login (always count as 1 if logged in)
      WHEN 'login' THEN
        v_count := 1;
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
      
      -- Auto-award badge if challenge has one
      IF v_challenge.reward_badge_id IS NOT NULL THEN
        INSERT INTO user_badges (user_id, badge_id, earned_at)
        VALUES (p_user_id, v_challenge.reward_badge_id, NOW())
        ON CONFLICT (user_id, badge_id) DO NOTHING;
      END IF;
    END IF;
  END LOOP;
END;
$function$;

-- Also update the grant_owner_all_badges to properly grant all badges
CREATE OR REPLACE FUNCTION public.grant_owner_all_badges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id UUID;
  v_badge RECORD;
BEGIN
  -- Get owner's user ID
  SELECT id INTO v_owner_id FROM profiles WHERE username = 'mrassburgers' LIMIT 1;
  
  IF v_owner_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Grant all badges to owner
  FOR v_badge IN SELECT id FROM badges WHERE is_active = true
  LOOP
    INSERT INTO user_badges (user_id, badge_id, earned_at, is_primary)
    VALUES (v_owner_id, v_badge.id, NOW(), false)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
  END LOOP;
END;
$function$;
