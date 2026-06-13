-- Snapchat-style push: prefs, quiet hours, grouped DMs, story triggers, richer payloads.

-- ── notification_preferences columns ─────────────────────────────────────────
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS show_message_preview BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS calls_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS friend_requests_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS streaks_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS stories_enabled BOOLEAN DEFAULT true;

-- ── notification types for stories ───────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'like'::text, 'comment'::text, 'follow'::text,
    'friend_request'::text, 'friend_accepted'::text, 'friend_declined'::text,
    'friend_accept'::text, 'message'::text, 'mention'::text, 'missed_call'::text,
    'announcement'::text, 'invite_accepted'::text, 'smart_ping'::text,
    'moderation_update'::text, 'story_like'::text, 'story_view'::text,
    'streak'::text, 'reaction'::text, 'comment_reply'::text, 'comment_like'::text,
    'story_reaction'::text, 'post_collab'::text, 'collab_invite'::text,
    'message_reaction'::text, 'tip'::text, 'gift'::text, 'shared_post'::text,
    'vybe_check'::text, 'system'::text
  ]));

-- ── quiet hours + category gate ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_in_quiet_hours(p_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start time;
  v_end time;
  v_now time := CURRENT_TIME;
BEGIN
  SELECT quiet_hours_start, quiet_hours_end
  INTO v_start, v_end
  FROM public.notification_preferences
  WHERE user_id = p_profile_id;

  IF v_start IS NULL OR v_end IS NULL THEN
    RETURN false;
  END IF;

  IF v_start < v_end THEN
    RETURN v_now >= v_start AND v_now < v_end;
  END IF;

  RETURN v_now >= v_start OR v_now < v_end;
END;
$function$;

CREATE OR REPLACE FUNCTION public.should_send_push(p_profile_id uuid, p_category text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefs public.notification_preferences%ROWTYPE;
  v_enabled boolean := true;
BEGIN
  SELECT * INTO v_prefs
  FROM public.notification_preferences
  WHERE user_id = p_profile_id;

  IF NOT FOUND THEN
    IF p_category <> 'call' AND public.is_in_quiet_hours(p_profile_id) THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  v_enabled := CASE p_category
    WHEN 'dm'              THEN COALESCE(v_prefs.dms_enabled, true)
    WHEN 'call'            THEN COALESCE(v_prefs.calls_enabled, true)
    WHEN 'like'            THEN COALESCE(v_prefs.likes_enabled, true)
    WHEN 'comment'         THEN COALESCE(v_prefs.comments_enabled, true)
    WHEN 'follow'          THEN COALESCE(v_prefs.follows_enabled, true)
    WHEN 'mention'         THEN COALESCE(v_prefs.mentions_enabled, true)
    WHEN 'friend_request'  THEN COALESCE(v_prefs.friend_requests_enabled, true)
    WHEN 'story'           THEN COALESCE(v_prefs.stories_enabled, true)
    WHEN 'streak'          THEN COALESCE(v_prefs.streaks_enabled, true)
    WHEN 'announcement'    THEN COALESCE(v_prefs.announcements_enabled, true)
    WHEN 'system'          THEN COALESCE(v_prefs.system_enabled, true)
    ELSE true
  END;

  IF NOT v_enabled THEN
    RETURN false;
  END IF;

  IF p_category <> 'call' AND public.is_in_quiet_hours(p_profile_id) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

-- ── fire_push_notification with optional data payload ──────────────────────
CREATE OR REPLACE FUNCTION public.fire_push_notification(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_url text DEFAULT '/notifications',
  p_tag text DEFAULT 'vybe-notification',
  p_type text DEFAULT 'general',
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text := public.get_supabase_project_url();
  v_service_key text := public.get_push_service_role_key();
BEGIN
  IF v_service_key IS NULL OR length(v_service_key) < 20 THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'userId', p_user_id,
      'title', p_title,
      'body', p_body,
      'url', p_url,
      'tag', p_tag,
      'type', p_type,
      'data', p_data
    )::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$function$;

-- ── Snapchat-style social / in-app notification push ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text := public.get_supabase_project_url();
  v_service_key text;
  v_actor RECORD;
  v_actor_name text;
  v_title text;
  v_body text;
  v_url text;
  v_tag text;
  v_image text;
  v_category text;
BEGIN
  v_service_key := public.get_push_service_role_key();

  IF v_service_key IS NULL OR length(v_service_key) < 20 THEN
    RETURN NEW;
  END IF;

  IF NEW.actor_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  v_category := CASE
    WHEN NEW.type IN ('like', 'reaction', 'comment_like') THEN 'like'
    WHEN NEW.type IN ('comment', 'comment_reply') THEN 'comment'
    WHEN NEW.type = 'follow' THEN 'follow'
    WHEN NEW.type = 'mention' THEN 'mention'
    WHEN NEW.type IN ('friend_request', 'friend_accept', 'friend_accepted') THEN 'friend_request'
    WHEN NEW.type IN ('story_like', 'story_view', 'story_reaction') THEN 'story'
    WHEN NEW.type = 'streak' THEN 'streak'
    WHEN NEW.type = 'announcement' THEN 'announcement'
    WHEN NEW.type IN ('system', 'moderation_update', 'vybe_check') THEN 'system'
    ELSE 'system'
  END;

  IF NOT public.should_send_push(NEW.user_id, v_category) THEN
    RETURN NEW;
  END IF;

  SELECT username, display_name, avatar_url INTO v_actor
  FROM public.profiles
  WHERE id = NEW.actor_id;

  v_actor_name := COALESCE(v_actor.display_name, v_actor.username, 'Someone');

  -- Snapchat-style: title = actor name only
  v_title := COALESCE(NULLIF(NEW.title, ''), v_actor_name);

  v_body := NULLIF(NEW.body, '');
  IF v_body IS NULL THEN
    v_body := CASE NEW.type
      WHEN 'like'             THEN 'is feeling your post'
      WHEN 'reaction'         THEN 'reacted to your post'
      WHEN 'comment'          THEN 'commented on your post'
      WHEN 'comment_reply'    THEN 'replied to your comment'
      WHEN 'comment_like'     THEN 'liked your comment'
      WHEN 'mention'          THEN 'mentioned you'
      WHEN 'follow'           THEN 'added you'
      WHEN 'friend_request'   THEN 'added you'
      WHEN 'friend_accept'    THEN 'accepted your friend request'
      WHEN 'friend_accepted'  THEN 'accepted your friend request'
      WHEN 'story_like'       THEN 'liked your story'
      WHEN 'story_reaction'   THEN 'reacted to your story'
      WHEN 'story_view'       THEN 'viewed your story'
      WHEN 'post_collab'      THEN 'invited you to collab'
      WHEN 'collab_invite'    THEN 'wants to collab'
      WHEN 'message_reaction' THEN 'reacted to your message'
      WHEN 'tip'              THEN 'sent you a tip'
      WHEN 'gift'             THEN 'sent you a gift'
      WHEN 'shared_post'      THEN 'shared your post'
      WHEN 'streak'           THEN 'Keep your streak alive'
      WHEN 'vybe_check'       THEN 'Time for a Vybe Check'
      WHEN 'system'           THEN 'New update from Vybe'
      WHEN 'announcement'     THEN 'New announcement'
      ELSE 'New activity on Vybe'
    END;
  END IF;

  v_url := COALESCE(
    NULLIF(NEW.deep_link, ''),
    CASE
      WHEN NEW.post_id IS NOT NULL THEN '/post/' || NEW.post_id
      WHEN NEW.type IN ('story_like', 'story_view', 'story_reaction')
        THEN '/stories'
      WHEN NEW.type IN ('follow', 'friend_request', 'friend_accept', 'friend_accepted')
        THEN '/profile/' || NEW.actor_id
      ELSE '/notifications'
    END
  );

  v_tag := CASE NEW.type
    WHEN 'friend_request' THEN 'vybe-friend-' || NEW.actor_id::text
    ELSE 'vybe-' || NEW.type || '-' || COALESCE(NEW.post_id::text, NEW.actor_id::text)
  END;

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
          'senderName', v_actor_name,
          'postId', NEW.post_id,
          'image_url', v_image,
          'senderAvatar', v_image,
          'subtype', NEW.subtype,
          'meta', NEW.meta,
          'preview', v_body
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;

-- ── Snapchat-style DM push ───────────────────────────────────────────────────
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
  v_supabase_url text := public.get_supabase_project_url();
  v_service_key text;
  v_sender_name text;
  v_title text;
  v_body text;
  v_preview text;
  v_show_preview boolean := true;
  v_last_read timestamptz;
  v_unread_count integer;
  v_conv_prefs RECORD;
  v_is_snap boolean;
  v_msg_kind text;
BEGIN
  v_service_key := public.get_push_service_role_key();

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
  v_is_snap := NEW.message_type = 'snap' OR NEW.view_mode = 'view_once';

  FOR recipient IN
    SELECT cm.user_id, cm.last_read_at
    FROM public.conversation_members cm
    WHERE cm.conversation_id = NEW.conversation_id
      AND cm.user_id != NEW.sender_id
      AND (cm.is_muted IS NULL OR cm.is_muted = false)
  LOOP
    IF NOT public.should_send_push(recipient.user_id, 'dm') THEN
      CONTINUE;
    END IF;

    SELECT cnp.muted_until, cnp.importance
    INTO v_conv_prefs
    FROM public.conversation_notification_prefs cnp
    JOIN public.profiles p ON p.user_id = cnp.user_id
    WHERE cnp.conversation_id = NEW.conversation_id
      AND p.id = recipient.user_id
    LIMIT 1;

    IF v_conv_prefs.muted_until IS NOT NULL AND v_conv_prefs.muted_until > now() THEN
      CONTINUE;
    END IF;

    IF v_conv_prefs.importance = 'silent' THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(np.show_message_preview, true)
    INTO v_show_preview
    FROM public.notification_preferences np
    WHERE np.user_id = recipient.user_id;

    IF NOT FOUND THEN
      v_show_preview := true;
    END IF;

    v_last_read := recipient.last_read_at;

    SELECT COUNT(*)::integer INTO v_unread_count
    FROM public.messages m
    WHERE m.conversation_id = NEW.conversation_id
      AND m.sender_id != recipient.user_id
      AND m.deleted_at IS NULL
      AND (v_last_read IS NULL OR m.created_at > v_last_read);

    IF conversation_info.is_group THEN
      v_title := COALESCE(conversation_info.name, 'Group chat');
    ELSE
      v_title := v_sender_name;
    END IF;

    IF v_show_preview THEN
      IF NEW.media_type = 'image' THEN
        v_msg_kind := 'photo';
        v_preview := CASE WHEN conversation_info.is_group
          THEN v_sender_name || ' sent a photo'
          ELSE 'Sent a photo' END;
      ELSIF NEW.media_type = 'voice' THEN
        v_msg_kind := 'voice';
        v_preview := CASE WHEN conversation_info.is_group
          THEN v_sender_name || ' sent a voice note'
          ELSE 'Sent a voice note' END;
      ELSIF NEW.media_type = 'video' THEN
        v_msg_kind := 'video';
        v_preview := CASE WHEN conversation_info.is_group
          THEN v_sender_name || ' sent a video'
          ELSE 'Sent a video' END;
      ELSIF v_is_snap THEN
        v_msg_kind := 'snap';
        v_preview := CASE WHEN conversation_info.is_group
          THEN v_sender_name || ' sent a Snap'
          ELSE 'New Snap' END;
      ELSIF NEW.ciphertext IS NOT NULL AND (NEW.content IS NULL OR NEW.content = '') THEN
        v_msg_kind := 'chat';
        v_preview := CASE WHEN conversation_info.is_group
          THEN v_sender_name || ': New message'
          ELSE 'New Chat' END;
      ELSE
        v_msg_kind := 'chat';
        v_preview := CASE WHEN conversation_info.is_group
          THEN v_sender_name || ': ' || LEFT(COALESCE(NEW.content, '…'), 100)
          ELSE LEFT(COALESCE(NEW.content, 'New message'), 100) END;
      END IF;
    ELSE
      IF v_is_snap THEN
        v_msg_kind := 'snap';
        v_preview := 'New Snap';
      ELSE
        v_msg_kind := 'chat';
        v_preview := 'New Chat';
      END IF;
    END IF;

    IF v_unread_count > 1 THEN
      IF v_msg_kind = 'snap' THEN
        v_body := 'Sent a Snap · ' || v_unread_count::text || ' new';
      ELSE
        v_body := v_unread_count::text || ' new messages';
      END IF;
    ELSE
      v_body := v_preview;
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
            'image_url', sender_profile.avatar_url,
            'unreadCount', v_unread_count,
            'preview', v_preview,
            'threadId', NEW.conversation_id::text
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

-- ── Call push with prefs + quiet hours (calls break through) ─────────────────
CREATE OR REPLACE FUNCTION public.notify_push_on_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text := public.get_supabase_project_url();
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

  v_service_key := public.get_push_service_role_key();

  IF v_service_key IS NULL OR length(v_service_key) < 20 THEN
    RETURN NEW;
  END IF;

  SELECT username, display_name, avatar_url INTO v_caller
  FROM public.profiles
  WHERE id = NEW.caller_id;

  v_caller_name := COALESCE(v_caller.display_name, v_caller.username, 'Someone');

  IF NEW.call_type = 'video' THEN
    v_title := v_caller_name;
    v_body := 'Video call';
  ELSE
    v_title := v_caller_name;
    v_body := 'Audio call';
  END IF;

  IF NOT NEW.is_group_call AND NEW.receiver_id IS NOT NULL THEN
    IF NOT public.should_send_push(NEW.receiver_id, 'call') THEN
      RETURN NEW;
    END IF;

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
            'image_url', v_caller.avatar_url,
            'senderAvatar', v_caller.avatar_url
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
      IF NOT public.should_send_push(v_member.user_id, 'call') THEN
        CONTINUE;
      END IF;

      BEGIN
        PERFORM net.http_post(
          url := v_supabase_url || '/functions/v1/send-push-notification',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
          ),
          body := jsonb_build_object(
            'userId', v_member.user_id,
            'title', COALESCE((SELECT name FROM public.conversations WHERE id = NEW.conversation_id), 'Group call'),
            'body', v_caller_name || ' started a ' || CASE WHEN NEW.call_type = 'video' THEN 'video' ELSE 'voice' END || ' call',
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
              'image_url', v_caller.avatar_url,
              'senderAvatar', v_caller.avatar_url
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

-- ── Story like → in-app notification (push via notify_push_on_notification) ──
CREATE OR REPLACE FUNCTION public.notify_story_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_author_id uuid;
BEGIN
  SELECT author_id INTO v_author_id
  FROM public.stories
  WHERE id = NEW.story_id;

  IF v_author_id IS NULL OR v_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  IF NOT public.should_send_push(v_author_id, 'story') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, actor_id, type, meta)
  VALUES (
    v_author_id,
    NEW.user_id,
    'story_like',
    jsonb_build_object('story_id', NEW.story_id)
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_story_like ON public.story_likes;
CREATE TRIGGER trg_notify_story_like
  AFTER INSERT ON public.story_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_story_like();

-- ── Story view → throttled notification ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_story_view()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_author_id uuid;
  v_recent_exists boolean;
BEGIN
  SELECT author_id INTO v_author_id
  FROM public.stories
  WHERE id = NEW.story_id;

  IF v_author_id IS NULL OR v_author_id = NEW.viewer_id THEN
    RETURN NEW;
  END IF;

  IF NOT public.should_send_push(v_author_id, 'story') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = v_author_id
      AND n.actor_id = NEW.viewer_id
      AND n.type = 'story_view'
      AND n.meta->>'story_id' = NEW.story_id::text
      AND n.created_at > now() - interval '1 hour'
  ) INTO v_recent_exists;

  IF v_recent_exists THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, actor_id, type, meta)
  VALUES (
    v_author_id,
    NEW.viewer_id,
    'story_view',
    jsonb_build_object('story_id', NEW.story_id)
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_story_view ON public.story_views;
CREATE TRIGGER trg_notify_story_view
  AFTER INSERT ON public.story_views
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_story_view();
