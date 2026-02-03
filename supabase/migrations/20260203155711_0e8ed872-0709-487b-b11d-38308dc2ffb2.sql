
-- Update grant_owner_all_badges to use case-insensitive matching
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
  -- Get owner's user ID (case insensitive)
  SELECT id INTO v_owner_id FROM profiles WHERE LOWER(username) = 'mrassburgers' LIMIT 1;
  
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

-- Also create a function to manually trigger badge sync for testing
CREATE OR REPLACE FUNCTION public.trigger_badge_sync_for_user(p_username TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM profiles WHERE LOWER(username) = LOWER(p_username) LIMIT 1;
  
  IF v_user_id IS NOT NULL THEN
    PERFORM sync_user_challenge_progress(v_user_id);
  END IF;
END;
$function$;
