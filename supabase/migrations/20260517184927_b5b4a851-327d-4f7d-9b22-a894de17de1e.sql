CREATE OR REPLACE FUNCTION public.notify_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text := 'https://agtcyxjxgkdyoxwxkjth.supabase.co';
  v_service_key text;
  v_actor RECORD;
  v_actor_name text;
  v_title text;
  v_body text;
  v_url text;
  v_tag text;
  v_image text;
  v_emoji text;
BEGIN
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

  IF NEW.actor_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT username, display_name, avatar_url INTO v_actor
  FROM public.profiles
  WHERE id = NEW.actor_id;

  v_actor_name := COALESCE(v_actor.display_name, v_actor.username, 'Someone');

  -- Per-type emoji + title flavor
  v_emoji := CASE NEW.type
    WHEN 'like'             THEN '💜'
    WHEN 'reaction'         THEN '✨'
    WHEN 'comment'          THEN '💬'
    WHEN 'comment_reply'    THEN '↩️'
    WHEN 'comment_like'     THEN '❤️'
    WHEN 'mention'          THEN '🏷️'
    WHEN 'follow'           THEN '👀'
    WHEN 'friend_request'   THEN '👋'
    WHEN 'friend_accept'    THEN '🤝'
    WHEN 'friend_accepted'  THEN '🤝'
    WHEN 'story_like'       THEN '🔥'
    WHEN 'story_reaction'   THEN '✨'
    WHEN 'story_view'       THEN '👁️'
    WHEN 'post_collab'      THEN '🤍'
    WHEN 'collab_invite'    THEN '🤍'
    WHEN 'message_reaction' THEN '😍'
    WHEN 'tip'              THEN '💸'
    WHEN 'gift'             THEN '🎁'
    WHEN 'shared_post'      THEN '🔁'
    WHEN 'streak'           THEN '🔥'
    WHEN 'vybe_check'       THEN '🌀'
    WHEN 'system'           THEN '⚡'
    WHEN 'announcement'     THEN '📣'
    ELSE '✨'
  END;

  -- Title: use explicit notification title if set, else "emoji actor"
  v_title := COALESCE(
    NULLIF(NEW.title, ''),
    v_emoji || ' ' || v_actor_name
  );

  -- Body: prefer explicit body, else distinctive copy per type
  v_body := NULLIF(NEW.body, '');
  IF v_body IS NULL THEN
    v_body := CASE NEW.type
      WHEN 'like'             THEN 'is feeling your post 💜'
      WHEN 'reaction'         THEN 'reacted to your post ✨'
      WHEN 'comment'          THEN 'dropped a comment on your post'
      WHEN 'comment_reply'    THEN 'replied to your comment ↩️'
      WHEN 'comment_like'     THEN 'liked your comment ❤️'
      WHEN 'mention'          THEN 'mentioned you — tap to see'
      WHEN 'follow'           THEN 'just followed you 👀'
      WHEN 'friend_request'   THEN 'wants to be friends 👋'
      WHEN 'friend_accept'    THEN 'accepted your friend request — you''re in 🤝'
      WHEN 'friend_accepted'  THEN 'accepted your friend request — you''re in 🤝'
      WHEN 'story_like'       THEN 'liked your story 🔥'
      WHEN 'story_reaction'   THEN 'reacted to your story ✨'
      WHEN 'story_view'       THEN 'watched your story 👁️'
      WHEN 'post_collab'      THEN 'invited you to collab on a post 🤍'
      WHEN 'collab_invite'    THEN 'wants to collab with you 🤍'
      WHEN 'message_reaction' THEN 'reacted to your message 😍'
      WHEN 'tip'              THEN 'sent you a tip 💸'
      WHEN 'gift'             THEN 'sent you a gift 🎁'
      WHEN 'shared_post'      THEN 'shared your post 🔁'
      WHEN 'streak'           THEN 'Your streak is on fire — keep it alive 🔥'
      WHEN 'vybe_check'       THEN 'Time for a Vybe Check 🌀'
      WHEN 'system'           THEN 'New update from Vybe ⚡'
      WHEN 'announcement'     THEN 'New announcement 📣'
      ELSE 'New activity on Vybe ✨'
    END;
  END IF;

  v_url := COALESCE(
    NULLIF(NEW.deep_link, ''),
    CASE
      WHEN NEW.post_id IS NOT NULL THEN '/post/' || NEW.post_id
      WHEN NEW.type IN ('follow','friend_request','friend_accept','friend_accepted')
        THEN '/profile/' || NEW.actor_id
      ELSE '/notifications'
    END
  );

  v_tag := 'vybe-' || NEW.type || '-' || COALESCE(NEW.post_id::text, NEW.actor_id::text);
  v_image := COALESCE(NULLIF(NEW.image_url, ''), v_actor.avatar_url);

  BEGIN
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'userId', NEW.user_id,
        'title', v_title,
        'body', v_body,
        'url', v_url,
        'tag', v_tag,
        'type', NEW.type,
        'data', jsonb_build_object(
          'notificationId', NEW.id,
          'actorId', NEW.actor_id,
          'actorName', v_actor_name,
          'postId', NEW.post_id,
          'image_url', v_image,
          'subtype', NEW.subtype,
          'meta', NEW.meta
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;


-- Cooler DM copy too
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
  v_sender_name text;
  v_title text;
  v_body text;
BEGIN
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

  SELECT username, display_name, avatar_url INTO sender_profile
  FROM public.profiles
  WHERE id = NEW.sender_id;

  SELECT is_group, name INTO conversation_info
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  v_sender_name := COALESCE(sender_profile.display_name, sender_profile.username, 'Someone');

  FOR recipient IN
    SELECT cm.user_id
    FROM public.conversation_members cm
    WHERE cm.conversation_id = NEW.conversation_id
      AND cm.user_id != NEW.sender_id
      AND (cm.is_muted IS NULL OR cm.is_muted = false)
  LOOP
    -- Title flavor
    IF conversation_info.is_group THEN
      v_title := '👥 ' || COALESCE(conversation_info.name, 'Group chat');
    ELSE
      v_title := '💬 ' || v_sender_name;
    END IF;

    -- Body flavor
    IF NEW.media_type = 'image' THEN
      v_body := CASE WHEN conversation_info.is_group
        THEN v_sender_name || ' sent a 📷 photo'
        ELSE 'sent you a 📷 photo' END;
    ELSIF NEW.media_type = 'voice' THEN
      v_body := CASE WHEN conversation_info.is_group
        THEN v_sender_name || ' sent a 🎤 voice note'
        ELSE 'sent you a 🎤 voice note' END;
    ELSIF NEW.media_type = 'video' THEN
      v_body := CASE WHEN conversation_info.is_group
        THEN v_sender_name || ' sent a 🎬 video'
        ELSE 'sent you a 🎬 video' END;
    ELSIF NEW.message_type = 'snap' OR NEW.view_mode = 'view_once' THEN
      v_body := CASE WHEN conversation_info.is_group
        THEN v_sender_name || ' sent a 👻 Vybe Snap'
        ELSE 'sent you a 👻 Vybe Snap — tap to view' END;
    ELSIF NEW.ciphertext IS NOT NULL AND (NEW.content IS NULL OR NEW.content = '') THEN
      v_body := CASE WHEN conversation_info.is_group
        THEN v_sender_name || ': 🔒 New message'
        ELSE '🔒 New encrypted message' END;
    ELSE
      v_body := CASE WHEN conversation_info.is_group
        THEN v_sender_name || ': ' || LEFT(COALESCE(NEW.content, '…'), 100)
        ELSE LEFT(COALESCE(NEW.content, 'New message'), 100) END;
    END IF;

    BEGIN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'userId', recipient.user_id,
          'title', v_title,
          'body', v_body,
          'url', '/messages/' || NEW.conversation_id,
          'tag', 'vybe-dm-' || NEW.conversation_id,
          'type', CASE WHEN conversation_info.is_group THEN 'group_message' ELSE 'dm' END,
          'data', jsonb_build_object(
            'conversationId', NEW.conversation_id,
            'senderName', v_sender_name,
            'senderAvatar', sender_profile.avatar_url,
            'groupName', conversation_info.name,
            'image_url', sender_profile.avatar_url
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


-- Cooler call copy
CREATE OR REPLACE FUNCTION public.notify_push_on_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text := 'https://agtcyxjxgkdyoxwxkjth.supabase.co';
  v_service_key text;
  v_caller RECORD;
  v_caller_name text;
  v_title text;
  v_body text;
  v_member RECORD;
BEGIN
  IF NEW.status IS DISTINCT FROM 'ringing' THEN
    RETURN NEW;
  END IF;

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

  SELECT username, display_name, avatar_url INTO v_caller
  FROM public.profiles
  WHERE id = NEW.caller_id;

  v_caller_name := COALESCE(v_caller.display_name, v_caller.username, 'Someone');

  IF NEW.call_type = 'video' THEN
    v_title := '📹 ' || v_caller_name;
    v_body := 'is video calling you… tap to answer';
  ELSE
    v_title := '📞 ' || v_caller_name;
    v_body := 'is calling you… tap to answer';
  END IF;

  IF NOT NEW.is_group_call AND NEW.receiver_id IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'userId', NEW.receiver_id,
          'title', v_title,
          'body', v_body,
          'url', '/messages/' || NEW.conversation_id || '?call=' || NEW.id,
          'tag', 'vybe-call-' || NEW.id,
          'type', 'call',
          'data', jsonb_build_object(
            'callId', NEW.id,
            'conversationId', NEW.conversation_id,
            'callerId', NEW.caller_id,
            'callerName', v_caller_name,
            'callType', NEW.call_type,
            'image_url', v_caller.avatar_url
          )
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF NEW.is_group_call THEN
    FOR v_member IN
      SELECT cm.user_id
      FROM public.conversation_members cm
      WHERE cm.conversation_id = NEW.conversation_id
        AND cm.user_id != NEW.caller_id
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
            'userId', v_member.user_id,
            'title', '👥📞 Group call • ' || v_caller_name,
            'body', 'started a ' || CASE WHEN NEW.call_type = 'video' THEN 'video' ELSE 'voice' END || ' call — jump in',
            'url', '/messages/' || NEW.conversation_id || '?call=' || NEW.id,
            'tag', 'vybe-call-' || NEW.id,
            'type', 'call',
            'data', jsonb_build_object(
              'callId', NEW.id,
              'conversationId', NEW.conversation_id,
              'callerId', NEW.caller_id,
              'callerName', v_caller_name,
              'callType', NEW.call_type,
              'isGroup', true,
              'image_url', v_caller.avatar_url
            )
          )
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;