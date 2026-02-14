
-- Fix the on_profile_updated trigger to properly detect complete profile
-- A profile is "complete" when it has: avatar_url AND display_name AND bio
CREATE OR REPLACE FUNCTION public.on_profile_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_complete BOOLEAN;
BEGIN
  -- Profile is complete when ALL three fields are filled
  v_is_complete := (
    NEW.avatar_url IS NOT NULL AND LENGTH(NEW.avatar_url) > 0
    AND NEW.display_name IS NOT NULL AND LENGTH(NEW.display_name) > 0
    AND NEW.bio IS NOT NULL AND LENGTH(NEW.bio) > 0
  );
  
  IF v_is_complete THEN
    PERFORM increment_challenge_progress(NEW.id, 'complete_profile');
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Also fix the sync function's complete_profile check to match
-- (it currently checks OR instead of AND)
CREATE OR REPLACE FUNCTION public.sync_my_challenge_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_id uuid;
  v_profile_id uuid;
  v_challenge RECORD;
  v_current_count integer;
  v_is_completed boolean;
BEGIN
  v_auth_id := auth.uid();
  IF v_auth_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_profile_id FROM profiles WHERE user_id = v_auth_id;
  IF v_profile_id IS NULL THEN RETURN; END IF;
  
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
        -- Profile is complete when ALL three fields are filled
        SELECT CASE 
          WHEN avatar_url IS NOT NULL AND LENGTH(avatar_url) > 0
            AND display_name IS NOT NULL AND LENGTH(display_name) > 0
            AND bio IS NOT NULL AND LENGTH(bio) > 0
          THEN 1 
          ELSE 0 
        END INTO v_current_count
        FROM profiles WHERE id = v_profile_id;
      WHEN 'invite' THEN
        CONTINUE;
      WHEN 'login' THEN
        CONTINUE;
      ELSE
        CONTINUE;
    END CASE;
    
    v_is_completed := v_current_count >= v_challenge.requirement_count;
    
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
      
      IF v_is_completed THEN
        INSERT INTO challenge_rewards (user_id, challenge_id, badge_id, xp_amount, is_claimed)
        VALUES (v_auth_id, v_challenge.id, v_challenge.reward_badge_id, COALESCE(v_challenge.reward_xp, 0), false)
        ON CONFLICT DO NOTHING;
        
        IF v_challenge.reward_badge_id IS NOT NULL THEN
          INSERT INTO user_badges (user_id, badge_id, is_active)
          VALUES (v_auth_id, v_challenge.reward_badge_id, true)
          ON CONFLICT (user_id, badge_id) DO NOTHING;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$function$;
