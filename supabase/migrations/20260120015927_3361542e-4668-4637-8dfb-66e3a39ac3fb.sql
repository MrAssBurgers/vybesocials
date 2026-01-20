-- Fix search_path security for the streak function
CREATE OR REPLACE FUNCTION public.update_streak_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id UUID;
  v_sender_id UUID;
  v_other_user_id UUID;
  v_user1_id UUID;
  v_user2_id UUID;
  v_existing_streak RECORD;
  v_new_expires_at TIMESTAMPTZ;
BEGIN
  v_conversation_id := NEW.conversation_id;
  v_sender_id := NEW.sender_id;
  
  -- Only process for DM conversations (not groups)
  SELECT cm.user_id INTO v_other_user_id
  FROM conversation_members cm
  JOIN conversations c ON c.id = cm.conversation_id
  WHERE cm.conversation_id = v_conversation_id
    AND cm.user_id != v_sender_id
    AND c.is_group = false
  LIMIT 1;
  
  IF v_other_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Consistent ordering: smaller UUID first
  IF v_sender_id < v_other_user_id THEN
    v_user1_id := v_sender_id;
    v_user2_id := v_other_user_id;
  ELSE
    v_user1_id := v_other_user_id;
    v_user2_id := v_sender_id;
  END IF;
  
  v_new_expires_at := NOW() + INTERVAL '24 hours';
  
  SELECT * INTO v_existing_streak
  FROM streaks
  WHERE user1_id = v_user1_id AND user2_id = v_user2_id;
  
  IF v_existing_streak IS NULL THEN
    INSERT INTO streaks (user1_id, user2_id, streak_count, last_message_at, expires_at)
    VALUES (v_user1_id, v_user2_id, 1, NOW(), v_new_expires_at);
  ELSE
    IF v_existing_streak.expires_at > NOW() THEN
      IF (NOW() - v_existing_streak.last_message_at) > INTERVAL '20 hours' THEN
        UPDATE streaks
        SET streak_count = streak_count + 1,
            last_message_at = NOW(),
            expires_at = v_new_expires_at
        WHERE user1_id = v_user1_id AND user2_id = v_user2_id;
      ELSE
        UPDATE streaks
        SET last_message_at = NOW(),
            expires_at = v_new_expires_at
        WHERE user1_id = v_user1_id AND user2_id = v_user2_id;
      END IF;
    ELSE
      UPDATE streaks
      SET streak_count = 1,
          last_message_at = NOW(),
          expires_at = v_new_expires_at
      WHERE user1_id = v_user1_id AND user2_id = v_user2_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;