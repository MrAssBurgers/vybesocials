-- Function to update streaks when a message is sent
CREATE OR REPLACE FUNCTION public.update_streak_on_message()
RETURNS TRIGGER AS $$
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
  -- Get the other member of this 1:1 conversation
  SELECT cm.user_id INTO v_other_user_id
  FROM conversation_members cm
  JOIN conversations c ON c.id = cm.conversation_id
  WHERE cm.conversation_id = v_conversation_id
    AND cm.user_id != v_sender_id
    AND c.is_group = false
  LIMIT 1;
  
  -- If no other user found (group chat or error), skip
  IF v_other_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Ensure consistent ordering: smaller UUID first
  IF v_sender_id < v_other_user_id THEN
    v_user1_id := v_sender_id;
    v_user2_id := v_other_user_id;
  ELSE
    v_user1_id := v_other_user_id;
    v_user2_id := v_sender_id;
  END IF;
  
  -- Streak expires 24 hours from now
  v_new_expires_at := NOW() + INTERVAL '24 hours';
  
  -- Check for existing streak between these users
  SELECT * INTO v_existing_streak
  FROM streaks
  WHERE user1_id = v_user1_id AND user2_id = v_user2_id;
  
  IF v_existing_streak IS NULL THEN
    -- Create new streak
    INSERT INTO streaks (user1_id, user2_id, streak_count, last_message_at, expires_at)
    VALUES (v_user1_id, v_user2_id, 1, NOW(), v_new_expires_at);
  ELSE
    -- Check if the streak was about to expire (last message was > 23 hours ago)
    -- This means a new day/period has passed
    IF v_existing_streak.expires_at > NOW() THEN
      -- Streak still valid - check if we should increment
      -- Only increment if enough time has passed (at least 20 hours since last message)
      IF (NOW() - v_existing_streak.last_message_at) > INTERVAL '20 hours' THEN
        -- Increment streak count
        UPDATE streaks
        SET streak_count = streak_count + 1,
            last_message_at = NOW(),
            expires_at = v_new_expires_at
        WHERE user1_id = v_user1_id AND user2_id = v_user2_id;
      ELSE
        -- Just update the expiry (keep alive)
        UPDATE streaks
        SET last_message_at = NOW(),
            expires_at = v_new_expires_at
        WHERE user1_id = v_user1_id AND user2_id = v_user2_id;
      END IF;
    ELSE
      -- Streak expired, reset to 1
      UPDATE streaks
      SET streak_count = 1,
          last_message_at = NOW(),
          expires_at = v_new_expires_at
      WHERE user1_id = v_user1_id AND user2_id = v_user2_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on messages table
DROP TRIGGER IF EXISTS trigger_update_streak_on_message ON messages;
CREATE TRIGGER trigger_update_streak_on_message
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION public.update_streak_on_message();

-- Add RLS policy for streaks if not exists
ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;

-- Users can view streaks they're part of
DROP POLICY IF EXISTS "Users can view their streaks" ON public.streaks;
CREATE POLICY "Users can view their streaks"
ON public.streaks
FOR SELECT
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Enable realtime for streaks
ALTER PUBLICATION supabase_realtime ADD TABLE public.streaks;