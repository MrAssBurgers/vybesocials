-- ===========================================
-- XP SYSTEM: Grant +200 XP per successful post
-- ===========================================

-- Create trigger function to grant XP when a post is created
CREATE OR REPLACE FUNCTION grant_xp_on_post_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_level_result json;
BEGIN
  -- Grant 200 XP for each post
  SELECT add_user_xp(NEW.author_id, 200) INTO v_level_result;
  
  IF (v_level_result->>'level_up')::boolean = true THEN
    -- Optionally log level up
    RAISE NOTICE 'User % leveled up to %', NEW.author_id, v_level_result->>'new_level';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for posts (this runs AFTER the post trigger for challenges)
DROP TRIGGER IF EXISTS trigger_xp_on_post ON posts;
CREATE TRIGGER trigger_xp_on_post
AFTER INSERT ON posts
FOR EACH ROW
EXECUTE FUNCTION grant_xp_on_post_created();

-- ===========================================
-- Create a function to manually grant XP (for clips, stories, snaps)
-- ===========================================
CREATE OR REPLACE FUNCTION grant_post_xp(p_user_id UUID, p_content_type TEXT DEFAULT 'post')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_level_result json;
BEGIN
  -- Grant 200 XP for content creation
  SELECT add_user_xp(p_user_id, 200) INTO v_level_result;
  
  RETURN json_build_object(
    'success', true,
    'xp_granted', 200,
    'content_type', p_content_type,
    'level_result', v_level_result
  );
END;
$$;

-- ===========================================
-- Rename VYBE Pass table comment (cosmetic only)
-- ===========================================
COMMENT ON TABLE battle_pass_tiers IS 'VYBE Pass tier rewards and progression';
COMMENT ON FUNCTION add_user_xp IS 'Add XP to user for VYBE Pass progression';

-- ===========================================
-- Add snap_sent trigger for challenge tracking
-- ===========================================
CREATE OR REPLACE FUNCTION on_snap_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Check if this is a snap/vybe message (video or image in chat)
  IF NEW.media_type IN ('video', 'image', 'vybe') THEN
    PERFORM increment_challenge_progress(NEW.sender_id, 'snap_sent');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_snap_challenge ON messages;
CREATE TRIGGER trigger_snap_challenge
AFTER INSERT ON messages
FOR EACH ROW
WHEN (NEW.media_url IS NOT NULL)
EXECUTE FUNCTION on_snap_sent();