-- Store service role key in vault so trigger can authenticate to edge function
DO $$
DECLARE
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFndGN5eGp4Z2tkeW94d3hranRoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIyOTk1MywiZXhwIjoyMDg1ODA1OTUzfQ.gJgxNgPb2-vQYInpkSyq8K4y8XQ-T68XS-aT1Dw7Sxg',
      'service_role_key',
      'Service role key used by DB triggers to invoke edge functions'
    );
  END IF;
END $$;

-- Rewrite notifier: hardcode URL, pull key from vault, work even without GUCs
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
  v_supabase_url text := 'https://agtcyxjxgkdyoxwxkjth.supabase.co';
  v_service_key text;
BEGIN
  -- Fetch service role key from vault (decrypted view)
  BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_service_key := NULL;
  END;

  IF v_service_key IS NULL OR length(v_service_key) < 20 THEN
    RETURN NEW;
  END IF;

  SELECT username, display_name INTO sender_profile
  FROM public.profiles
  WHERE id = NEW.sender_id;

  SELECT is_group, name INTO conversation_info
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  FOR recipient IN
    SELECT cm.user_id
    FROM public.conversation_members cm
    WHERE cm.conversation_id = NEW.conversation_id
      AND cm.user_id != NEW.sender_id
      AND (cm.is_muted IS NULL OR cm.is_muted = false)
  LOOP
    BEGIN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'userId', recipient.user_id,
          'title', CASE
            WHEN conversation_info.is_group AND conversation_info.name IS NOT NULL
              THEN conversation_info.name
            ELSE COALESCE(sender_profile.display_name, sender_profile.username, 'New message')
          END,
          'body', CASE
            WHEN conversation_info.is_group THEN
              COALESCE(sender_profile.display_name, sender_profile.username, 'Someone') || ': ' ||
              CASE
                WHEN NEW.media_type = 'image' THEN '📷 Photo'
                WHEN NEW.media_type = 'voice' THEN '🎤 Voice message'
                WHEN NEW.media_type = 'video' THEN '🎬 Video'
                WHEN NEW.ciphertext IS NOT NULL AND (NEW.content IS NULL OR NEW.content = '') THEN '🔒 New message'
                ELSE LEFT(COALESCE(NEW.content, 'New message'), 100)
              END
            ELSE
              CASE
                WHEN NEW.media_type = 'image' THEN '📷 sent a photo'
                WHEN NEW.media_type = 'voice' THEN '🎤 sent a voice message'
                WHEN NEW.media_type = 'video' THEN '🎬 sent a video'
                WHEN NEW.ciphertext IS NOT NULL AND (NEW.content IS NULL OR NEW.content = '') THEN '🔒 New message'
                ELSE LEFT(COALESCE(NEW.content, 'New message'), 100)
              END
          END,
          'url', '/messages/' || NEW.conversation_id,
          'tag', 'vybe-dm-' || NEW.conversation_id,
          'type', CASE WHEN conversation_info.is_group THEN 'group_message' ELSE 'dm' END,
          'data', jsonb_build_object(
            'conversationId', NEW.conversation_id,
            'senderName', COALESCE(sender_profile.display_name, sender_profile.username),
            'groupName', conversation_info.name
          )
        )
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN NEW;
END;
$function$;