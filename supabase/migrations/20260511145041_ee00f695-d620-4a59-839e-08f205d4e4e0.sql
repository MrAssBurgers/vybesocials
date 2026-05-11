
-- =========================================
-- 1) Landing page: opt-in flag + top creators RPC
-- =========================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS feature_on_landing boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_feature_on_landing
  ON public.profiles (feature_on_landing) WHERE feature_on_landing = true;

CREATE OR REPLACE FUNCTION public.get_landing_top_creators(_limit integer DEFAULT 4)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent_posts AS (
    SELECT p.id, p.author_id, p.view_count
    FROM posts p
    WHERE p.created_at > now() - interval '24 hours'
  ),
  scored AS (
    SELECT
      rp.author_id,
      SUM(
        COALESCE(rp.view_count, 0) * 0.1
        + COALESCE((SELECT count(*) FROM likes l WHERE l.post_id = rp.id), 0) * 1
        + COALESCE((SELECT count(*) FROM comments c WHERE c.post_id = rp.id), 0) * 3
      )::numeric AS score
    FROM recent_posts rp
    GROUP BY rp.author_id
  )
  SELECT pr.id, pr.username, pr.display_name, pr.avatar_url, s.score
  FROM scored s
  JOIN profiles pr ON pr.id = s.author_id
  WHERE COALESCE(pr.is_private, false) = false
    AND pr.feature_on_landing = true
    AND s.score > 0
  ORDER BY s.score DESC, pr.id
  LIMIT GREATEST(1, LEAST(_limit, 12));
$$;

GRANT EXECUTE ON FUNCTION public.get_landing_top_creators(integer) TO anon, authenticated;

-- =========================================
-- 2) 48h disappearing DMs + tap-to-save
-- =========================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS saved_by_sender boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saved_by_recipient boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saved_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_messages_expires_at
  ON public.messages (expires_at) WHERE expires_at IS NOT NULL AND is_deleted = false;

-- Auto-set 48h expiry on insert when:
--   - expires_at is null (i.e. not a snap/24h message that already has an expiry)
--   - conversation is 1:1 (not a group)
--   - view_mode is 'permanent' or null
CREATE OR REPLACE FUNCTION public.set_dm_default_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_group boolean;
BEGIN
  IF NEW.expires_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.view_mode IS NOT NULL AND NEW.view_mode NOT IN ('permanent') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(c.is_group, false) INTO _is_group
  FROM conversations c
  WHERE c.id = NEW.conversation_id;

  IF _is_group IS DISTINCT FROM true THEN
    NEW.expires_at := COALESCE(NEW.created_at, now()) + interval '48 hours';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_dm_default_expiry ON public.messages;
CREATE TRIGGER trg_set_dm_default_expiry
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.set_dm_default_expiry();

-- When either party saves the message, clear expires_at.
-- When both un-save, restore expiry only if the message is still within the 48h window
-- and it's a 1:1 DM.
CREATE OR REPLACE FUNCTION public.sync_message_saved_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_group boolean;
BEGIN
  IF NEW.saved_by_sender OR NEW.saved_by_recipient THEN
    NEW.expires_at := NULL;
    IF NEW.saved_at IS NULL THEN
      NEW.saved_at := now();
    END IF;
  ELSE
    NEW.saved_at := NULL;
    SELECT COALESCE(c.is_group, false) INTO _is_group
    FROM conversations c
    WHERE c.id = NEW.conversation_id;
    IF _is_group IS DISTINCT FROM true
       AND (NEW.view_mode IS NULL OR NEW.view_mode = 'permanent')
       AND NEW.expires_at IS NULL THEN
      NEW.expires_at := NEW.created_at + interval '48 hours';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_message_saved_expiry ON public.messages;
CREATE TRIGGER trg_sync_message_saved_expiry
BEFORE UPDATE OF saved_by_sender, saved_by_recipient ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.sync_message_saved_expiry();

-- RPC: toggle save state for the current caller on a message they participate in.
CREATE OR REPLACE FUNCTION public.toggle_message_saved(_message_id uuid)
RETURNS TABLE (
  saved_by_sender boolean,
  saved_by_recipient boolean,
  saved_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_profile uuid;
  _msg record;
  _is_member boolean;
  _is_sender boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT p.id INTO _caller_profile
  FROM profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF _caller_profile IS NULL THEN
    RAISE EXCEPTION 'no profile';
  END IF;

  SELECT m.* INTO _msg FROM messages m WHERE m.id = _message_id;
  IF _msg.id IS NULL THEN
    RAISE EXCEPTION 'message not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM conversation_members cm
    WHERE cm.conversation_id = _msg.conversation_id
      AND cm.user_id = _caller_profile
  ) INTO _is_member;

  IF NOT _is_member THEN
    RAISE EXCEPTION 'not a participant';
  END IF;

  _is_sender := _msg.sender_id = _caller_profile;

  IF _is_sender THEN
    UPDATE messages
       SET saved_by_sender = NOT COALESCE(saved_by_sender, false)
     WHERE id = _message_id
     RETURNING messages.saved_by_sender, messages.saved_by_recipient,
               messages.saved_at, messages.expires_at
       INTO saved_by_sender, saved_by_recipient, saved_at, expires_at;
  ELSE
    UPDATE messages
       SET saved_by_recipient = NOT COALESCE(saved_by_recipient, false)
     WHERE id = _message_id
     RETURNING messages.saved_by_sender, messages.saved_by_recipient,
               messages.saved_at, messages.expires_at
       INTO saved_by_sender, saved_by_recipient, saved_at, expires_at;
  END IF;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_message_saved(uuid) TO authenticated;

-- Cleanup function: soft-delete expired messages
CREATE OR REPLACE FUNCTION public.cleanup_expired_messages()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.messages
     SET is_deleted = true,
         content = NULL,
         media_url = NULL
   WHERE expires_at IS NOT NULL
     AND expires_at < now()
     AND COALESCE(is_deleted, false) = false
     AND COALESCE(saved_by_sender, false) = false
     AND COALESCE(saved_by_recipient, false) = false;
$$;

-- Schedule cleanup every 5 minutes
SELECT cron.schedule(
  'cleanup-expired-dm-messages',
  '*/5 * * * *',
  $$ SELECT public.cleanup_expired_messages(); $$
);
