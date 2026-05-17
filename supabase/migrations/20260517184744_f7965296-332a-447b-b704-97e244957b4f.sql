-- ============================================================
-- Universal push fan-out for in-app notifications
-- ============================================================
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
  v_title text;
  v_body text;
  v_url text;
  v_tag text;
  v_image text;
BEGIN
  -- Fetch service role key from vault
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

  -- Don't push to yourself
  IF NEW.actor_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Resolve actor display name + avatar
  SELECT username, display_name, avatar_url INTO v_actor
  FROM public.profiles
  WHERE id = NEW.actor_id;

  -- Build title — prefer explicit title, else actor's name
  v_title := COALESCE(
    NULLIF(NEW.title, ''),
    COALESCE(v_actor.display_name, v_actor.username, 'Someone')
  );

  -- Build body — prefer explicit body, else infer from type
  v_body := NULLIF(NEW.body, '');
  IF v_body IS NULL THEN
    v_body := CASE NEW.type
      WHEN 'like'              THEN 'liked your post'
      WHEN 'reaction'          THEN 'reacted to your post'
      WHEN 'comment'           THEN 'commented on your post'
      WHEN 'comment_reply'     THEN 'replied to your comment'
      WHEN 'comment_like'      THEN 'liked your comment'
      WHEN 'mention'           THEN 'mentioned you'
      WHEN 'follow'            THEN 'started following you'
      WHEN 'friend_request'    THEN 'sent you a friend request'
      WHEN 'friend_accept'     THEN 'accepted your friend request'
      WHEN 'friend_accepted'   THEN 'accepted your friend request'
      WHEN 'story_like'        THEN 'liked your story'
      WHEN 'story_reaction'    THEN 'reacted to your story'
      WHEN 'story_view'        THEN 'viewed your story'
      WHEN 'post_collab'       THEN 'invited you to collaborate on a post'
      WHEN 'collab_invite'     THEN 'invited you to collaborate'
      WHEN 'message_reaction'  THEN 'reacted to your message'
      WHEN 'tip'               THEN 'sent you a tip'
      WHEN 'gift'              THEN 'sent you a gift'
      WHEN 'shared_post'       THEN 'shared your post'
      WHEN 'system'            THEN 'New update'
      ELSE 'New activity'
    END;
  END IF;

  -- Deep link
  v_url := COALESCE(
    NULLIF(NEW.deep_link, ''),
    CASE
      WHEN NEW.post_id IS NOT NULL THEN '/post/' || NEW.post_id
      WHEN NEW.type IN ('follow','friend_request','friend_accept','friend_accepted')
        THEN '/profile/' || NEW.actor_id
      ELSE '/notifications'
    END
  );

  -- Collapse-key so spammy notifs (multiple likes) replace rather than stack
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
          'actorName', COALESCE(v_actor.display_name, v_actor.username),
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

DROP TRIGGER IF EXISTS on_notification_insert_push ON public.notifications;
CREATE TRIGGER on_notification_insert_push
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.notify_push_on_notification();


-- ============================================================
-- Incoming-call push (rings the phone even with app closed)
-- ============================================================
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
  v_body text;
  v_member RECORD;
BEGIN
  -- Only push on ringing calls
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

  v_body := CASE
    WHEN NEW.call_type = 'video' THEN 'Incoming video call…'
    ELSE 'Incoming call…'
  END;

  -- 1-on-1 call → push to receiver_id
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
          'title', COALESCE(v_caller.display_name, v_caller.username, 'Someone'),
          'body', v_body,
          'url', '/messages/' || NEW.conversation_id || '?call=' || NEW.id,
          'tag', 'vybe-call-' || NEW.id,
          'type', 'call',
          'data', jsonb_build_object(
            'callId', NEW.id,
            'conversationId', NEW.conversation_id,
            'callerId', NEW.caller_id,
            'callerName', COALESCE(v_caller.display_name, v_caller.username),
            'callType', NEW.call_type,
            'image_url', v_caller.avatar_url
          )
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- Group call → push all other conversation members
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
            'title', COALESCE(v_caller.display_name, v_caller.username, 'Someone') || ' • Group call',
            'body', v_body,
            'url', '/messages/' || NEW.conversation_id || '?call=' || NEW.id,
            'tag', 'vybe-call-' || NEW.id,
            'type', 'call',
            'data', jsonb_build_object(
              'callId', NEW.id,
              'conversationId', NEW.conversation_id,
              'callerId', NEW.caller_id,
              'callerName', COALESCE(v_caller.display_name, v_caller.username),
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

DROP TRIGGER IF EXISTS on_call_insert_push ON public.calls;
CREATE TRIGGER on_call_insert_push
AFTER INSERT ON public.calls
FOR EACH ROW
EXECUTE FUNCTION public.notify_push_on_call();