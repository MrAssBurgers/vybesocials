
-- ====================================================
-- Push notification triggers for likes, comments, follows
-- Each trigger: 1) inserts a notification row, 2) fires push via pg_net
-- ====================================================

-- Helper: fire push notification via Edge Function (reusable)
CREATE OR REPLACE FUNCTION public.fire_push_notification(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_url text DEFAULT '/notifications',
  p_tag text DEFAULT 'vybe-notification',
  p_type text DEFAULT 'general'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supabase_url text;
  v_service_key text;
BEGIN
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);
  
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
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
      'type', p_type
    )::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  -- Never block the originating operation
  NULL;
END;
$$;

-- ====================================================
-- 1. LIKE notification trigger
-- ====================================================
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_author_id uuid;
  v_liker_name text;
  v_post_caption text;
BEGIN
  -- Get post author
  SELECT author_id, LEFT(COALESCE(caption, ''), 50)
    INTO v_post_author_id, v_post_caption
    FROM posts WHERE id = NEW.post_id;

  -- Don't notify yourself
  IF v_post_author_id IS NULL OR v_post_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get liker's name
  SELECT COALESCE(display_name, username) INTO v_liker_name
    FROM profiles WHERE id = NEW.user_id;

  -- Insert notification row
  INSERT INTO notifications (user_id, type, actor_id, post_id)
  VALUES (v_post_author_id, 'like', NEW.user_id, NEW.post_id)
  ON CONFLICT DO NOTHING;

  -- Fire push
  PERFORM fire_push_notification(
    v_post_author_id,
    COALESCE(v_liker_name, 'Someone'),
    'liked your post' || CASE WHEN v_post_caption != '' THEN ': "' || v_post_caption || '..."' ELSE '' END,
    '/post/' || NEW.post_id,
    'vybe-like-' || NEW.post_id,
    'like'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_like ON public.likes;
CREATE TRIGGER trg_notify_on_like
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION notify_on_like();

-- ====================================================
-- 2. COMMENT notification trigger
-- ====================================================
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_author_id uuid;
  v_commenter_name text;
  v_comment_preview text;
BEGIN
  -- Get post author
  SELECT author_id INTO v_post_author_id
    FROM posts WHERE id = NEW.post_id;

  -- Don't notify yourself
  IF v_post_author_id IS NULL OR v_post_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get commenter's name
  SELECT COALESCE(display_name, username) INTO v_commenter_name
    FROM profiles WHERE id = NEW.user_id;

  v_comment_preview := LEFT(NEW.text, 80);

  -- Insert notification row
  INSERT INTO notifications (user_id, type, actor_id, post_id)
  VALUES (v_post_author_id, 'comment', NEW.user_id, NEW.post_id)
  ON CONFLICT DO NOTHING;

  -- Fire push
  PERFORM fire_push_notification(
    v_post_author_id,
    COALESCE(v_commenter_name, 'Someone'),
    'commented: "' || v_comment_preview || '"',
    '/post/' || NEW.post_id,
    'vybe-comment-' || NEW.post_id,
    'comment'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_comment ON public.comments;
CREATE TRIGGER trg_notify_on_comment
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION notify_on_comment();

-- ====================================================
-- 3. FOLLOW notification trigger
-- ====================================================
CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_follower_name text;
BEGIN
  -- Don't notify yourself (shouldn't happen but safety)
  IF NEW.follower_id = NEW.following_id THEN
    RETURN NEW;
  END IF;

  -- Get follower's name
  SELECT COALESCE(display_name, username) INTO v_follower_name
    FROM profiles WHERE id = NEW.follower_id;

  -- Insert notification row
  INSERT INTO notifications (user_id, type, actor_id)
  VALUES (NEW.following_id, 'follow', NEW.follower_id)
  ON CONFLICT DO NOTHING;

  -- Fire push
  PERFORM fire_push_notification(
    NEW.following_id,
    COALESCE(v_follower_name, 'Someone'),
    'started following you',
    '/profile/' || NEW.follower_id,
    'vybe-follow-' || NEW.follower_id,
    'follow'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_follow ON public.follows;
CREATE TRIGGER trg_notify_on_follow
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION notify_on_follow();
