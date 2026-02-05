-- Create a function to send push notifications for new messages
CREATE OR REPLACE FUNCTION public.notify_message_recipients()
RETURNS TRIGGER AS $$
DECLARE
  recipient RECORD;
  sender_profile RECORD;
  conversation_info RECORD;
  push_result JSONB;
BEGIN
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
    -- Call the edge function to send push notification
    -- Note: This uses pg_net for async HTTP calls
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
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
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for new messages
DROP TRIGGER IF EXISTS on_message_insert_notify ON public.messages;
CREATE TRIGGER on_message_insert_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_message_recipients();