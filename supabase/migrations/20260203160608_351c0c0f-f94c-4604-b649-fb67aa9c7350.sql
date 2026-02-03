-- Step 1: Make badge_type and badge_name nullable to fix schema mismatch
ALTER TABLE public.user_badges 
  ALTER COLUMN badge_type DROP NOT NULL,
  ALTER COLUMN badge_name DROP NOT NULL;

-- Step 2: Drop old unique constraint on (user_id, badge_type) if exists
ALTER TABLE public.user_badges 
  DROP CONSTRAINT IF EXISTS user_badges_user_id_badge_type_key;

-- Step 3: Add proper unique constraint on (user_id, badge_id) if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_badges_user_id_badge_id_key'
  ) THEN
    ALTER TABLE public.user_badges 
      ADD CONSTRAINT user_badges_user_id_badge_id_key UNIQUE (user_id, badge_id);
  END IF;
END $$;

-- Step 4: Backfill existing records with badge_type and badge_name from badges table
UPDATE public.user_badges ub
SET 
  badge_type = COALESCE(ub.badge_type, b.category::text),
  badge_name = COALESCE(ub.badge_name, b.name)
FROM public.badges b
WHERE ub.badge_id = b.id
  AND (ub.badge_type IS NULL OR ub.badge_name IS NULL);

-- Step 5: Create/Replace grant_owner_all_badges function
CREATE OR REPLACE FUNCTION public.grant_owner_all_badges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_badge RECORD;
BEGIN
  -- Find owner by username (case-insensitive)
  SELECT id INTO v_owner_id 
  FROM profiles 
  WHERE LOWER(TRIM(username)) = 'mrassburgers' 
  LIMIT 1;
  
  IF v_owner_id IS NULL THEN 
    RAISE NOTICE 'Owner not found';
    RETURN; 
  END IF;
  
  -- Grant all active badges to owner
  FOR v_badge IN SELECT id, name, category FROM badges WHERE is_active = true
  LOOP
    INSERT INTO user_badges (
      user_id, badge_id, badge_type, badge_name, 
      earned_at, show_effect, is_primary
    )
    VALUES (
      v_owner_id, v_badge.id, v_badge.category::text, v_badge.name,
      NOW(), true, false
    )
    ON CONFLICT (user_id, badge_id) DO NOTHING;
  END LOOP;
  
  RAISE NOTICE 'Owner badges granted successfully';
END;
$$;

-- Step 6: Create wrapper for RPC call (check_and_grant_owner_badges)
CREATE OR REPLACE FUNCTION public.check_and_grant_owner_badges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM grant_owner_all_badges();
END;
$$;

-- Step 7: Update sync_user_challenge_progress to properly insert badges
CREATE OR REPLACE FUNCTION public.sync_user_challenge_progress(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge RECORD;
  v_current_count INTEGER;
BEGIN
  -- Loop through all active challenges
  FOR v_challenge IN 
    SELECT c.*, b.name as badge_name, b.category as badge_category
    FROM challenges c
    LEFT JOIN badges b ON c.reward_badge_id = b.id
    WHERE c.is_active = true
  LOOP
    -- Calculate current progress based on requirement type
    CASE v_challenge.requirement_type
      WHEN 'posts' THEN
        SELECT COUNT(*) INTO v_current_count 
        FROM posts WHERE user_id = p_user_id;
      WHEN 'friends' THEN
        SELECT COUNT(*) INTO v_current_count 
        FROM friends 
        WHERE (user_id = p_user_id OR friend_id = p_user_id) 
          AND status = 'accepted';
      WHEN 'messages' THEN
        SELECT COUNT(*) INTO v_current_count 
        FROM messages WHERE sender_id = p_user_id;
      WHEN 'likes' THEN
        SELECT COUNT(*) INTO v_current_count 
        FROM likes WHERE user_id = p_user_id;
      WHEN 'comments' THEN
        SELECT COUNT(*) INTO v_current_count 
        FROM comments WHERE user_id = p_user_id;
      WHEN 'referrals' THEN
        SELECT COALESCE(referral_count, 0) INTO v_current_count 
        FROM profiles WHERE id = p_user_id;
      WHEN 'streak' THEN
        SELECT COALESCE(MAX(streak_count), 0) INTO v_current_count
        FROM streaks WHERE user_id = p_user_id;
      ELSE
        v_current_count := 0;
    END CASE;
    
    -- Upsert progress
    INSERT INTO challenge_progress (
      user_id, challenge_id, current_count, 
      is_completed, completed_at
    )
    VALUES (
      p_user_id, v_challenge.id, v_current_count,
      v_current_count >= COALESCE(v_challenge.requirement_count, 1),
      CASE WHEN v_current_count >= COALESCE(v_challenge.requirement_count, 1) 
           THEN NOW() ELSE NULL END
    )
    ON CONFLICT (user_id, challenge_id) 
    DO UPDATE SET
      current_count = EXCLUDED.current_count,
      is_completed = EXCLUDED.is_completed,
      completed_at = COALESCE(challenge_progress.completed_at, EXCLUDED.completed_at),
      updated_at = NOW();
    
    -- If completed and has badge reward, grant the badge
    IF v_current_count >= COALESCE(v_challenge.requirement_count, 1) 
       AND v_challenge.reward_badge_id IS NOT NULL THEN
      INSERT INTO user_badges (
        user_id, badge_id, badge_type, badge_name, 
        earned_at, show_effect
      )
      VALUES (
        p_user_id, 
        v_challenge.reward_badge_id, 
        COALESCE(v_challenge.badge_category::text, 'achievement'),
        COALESCE(v_challenge.badge_name, 'Achievement'),
        NOW(), 
        true
      )
      ON CONFLICT (user_id, badge_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Step 8: Create sync_my_challenge_progress wrapper for authenticated users
CREATE OR REPLACE FUNCTION public.sync_my_challenge_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  PERFORM sync_user_challenge_progress(auth.uid());
END;
$$;