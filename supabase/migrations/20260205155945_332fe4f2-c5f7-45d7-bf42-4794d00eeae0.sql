-- ====================================================
-- A) HOTFIX: Make notify_message_recipients() fail-safe
-- ====================================================

-- Drop and recreate the function with exception handling
CREATE OR REPLACE FUNCTION public.notify_message_recipients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  recipient RECORD;
  sender_profile RECORD;
  conversation_info RECORD;
  v_supabase_url text;
  v_service_key text;
BEGIN
  -- Get settings - if missing, just return (don't block message)
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);
  
  -- If settings are not configured, skip push notifications entirely
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get sender info
  SELECT username, display_name INTO sender_profile
  FROM public.profiles
  WHERE id = NEW.sender_id;
  
  -- Get conversation info
  SELECT is_group, name INTO conversation_info
  FROM public.conversations
  WHERE id = NEW.conversation_id;
  
  -- For each member of the conversation (except sender)
  FOR recipient IN
    SELECT cm.user_id
    FROM public.conversation_members cm
    WHERE cm.conversation_id = NEW.conversation_id
      AND cm.user_id != NEW.sender_id
      AND (cm.is_muted IS NULL OR cm.is_muted = false)
  LOOP
    BEGIN
      -- Call the edge function to send push notification
      -- Wrapped in BEGIN/EXCEPTION to never fail the message insert
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'userId', recipient.user_id,
          'title', COALESCE(conversation_info.name, COALESCE(sender_profile.display_name, sender_profile.username)),
          'body', CASE 
            WHEN NEW.media_type = 'image' THEN '📷 Photo'
            WHEN NEW.media_type = 'voice' THEN '🎤 Voice message'
            WHEN NEW.media_type = 'video' THEN '🎬 Video'
            ELSE LEFT(COALESCE(NEW.content, 'New message'), 100)
          END,
          'url', '/messages/' || NEW.conversation_id,
          'tag', 'vybe-dm-' || NEW.conversation_id,
          'type', CASE WHEN conversation_info.is_group THEN 'group_message' ELSE 'dm' END,
          'conversationId', NEW.conversation_id,
          'senderName', COALESCE(sender_profile.display_name, sender_profile.username),
          'groupName', conversation_info.name
        )::jsonb
      );
    EXCEPTION WHEN OTHERS THEN
      -- Swallow any errors - push notifications should never block messaging
      NULL;
    END;
  END LOOP;
  
  RETURN NEW;
END;
$function$;

-- ====================================================
-- D) Fix challenge_progress RLS policies
-- ====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own challenge progress" ON public.challenge_progress;
DROP POLICY IF EXISTS "Users can manage own challenge progress" ON public.challenge_progress;

-- Create correct policies using current_profile_id()
CREATE POLICY "Users can view own challenge progress"
ON public.challenge_progress
FOR SELECT
USING (current_profile_id() = user_id);

CREATE POLICY "Users can manage own challenge progress"
ON public.challenge_progress
FOR ALL
USING (current_profile_id() = user_id)
WITH CHECK (current_profile_id() = user_id);

-- ====================================================
-- F) Fix link_profile_to_auth() trigger
-- ====================================================

CREATE OR REPLACE FUNCTION public.link_profile_to_auth()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only set user_id if:
  -- 1. It's not already set (unclaimed profile), AND
  -- 2. auth.uid() is available (real user signup, not admin import)
  IF NEW.user_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;