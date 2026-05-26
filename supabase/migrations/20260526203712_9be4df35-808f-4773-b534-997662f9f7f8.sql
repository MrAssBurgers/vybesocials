
ALTER TABLE public.streaks
  ADD COLUMN IF NOT EXISTS user1_last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS user2_last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_incremented_on date,
  ADD COLUMN IF NOT EXISTS expiring_notice_sent_at timestamptz;

UPDATE public.streaks
SET user1_last_message_at = COALESCE(user1_last_message_at, last_message_at),
    user2_last_message_at = COALESCE(user2_last_message_at, last_message_at),
    last_incremented_on = COALESCE(last_incremented_on, (last_message_at AT TIME ZONE 'UTC')::date)
WHERE user1_last_message_at IS NULL
   OR user2_last_message_at IS NULL
   OR last_incremented_on IS NULL;

CREATE OR REPLACE FUNCTION public.update_streak_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id uuid := NEW.sender_id;
  v_other_user_id uuid;
  v_is_group boolean;
  v_user1_id uuid;
  v_user2_id uuid;
  v_row public.streaks%ROWTYPE;
  v_sender_is_user1 boolean;
  v_other_last timestamptz;
  v_today date := (NOW() AT TIME ZONE 'UTC')::date;
  v_expires timestamptz;
BEGIN
  IF NEW.is_deleted IS TRUE THEN RETURN NEW; END IF;

  SELECT is_group INTO v_is_group FROM conversations WHERE id = NEW.conversation_id;
  IF v_is_group IS DISTINCT FROM false THEN RETURN NEW; END IF;

  SELECT user_id INTO v_other_user_id
  FROM conversation_members
  WHERE conversation_id = NEW.conversation_id
    AND user_id <> v_sender_id
  LIMIT 1;
  IF v_other_user_id IS NULL THEN RETURN NEW; END IF;

  IF v_sender_id < v_other_user_id THEN
    v_user1_id := v_sender_id;
    v_user2_id := v_other_user_id;
    v_sender_is_user1 := true;
  ELSE
    v_user1_id := v_other_user_id;
    v_user2_id := v_sender_id;
    v_sender_is_user1 := false;
  END IF;

  SELECT * INTO v_row
  FROM public.streaks
  WHERE user1_id = v_user1_id AND user2_id = v_user2_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    INSERT INTO public.streaks (
      user1_id, user2_id,
      streak_count, last_message_at, expires_at,
      user1_last_message_at, user2_last_message_at,
      last_incremented_on
    ) VALUES (
      v_user1_id, v_user2_id,
      0, NOW(), NOW() + INTERVAL '24 hours',
      CASE WHEN v_sender_is_user1 THEN NOW() ELSE NULL END,
      CASE WHEN v_sender_is_user1 THEN NULL ELSE NOW() END,
      NULL
    );
    RETURN NEW;
  END IF;

  IF v_row.expires_at <= NOW() THEN
    UPDATE public.streaks
    SET streak_count = 0,
        last_message_at = NOW(),
        expires_at = NOW() + INTERVAL '24 hours',
        user1_last_message_at = CASE WHEN v_sender_is_user1 THEN NOW() ELSE NULL END,
        user2_last_message_at = CASE WHEN v_sender_is_user1 THEN NULL ELSE NOW() END,
        last_incremented_on = NULL,
        expiring_notice_sent_at = NULL
    WHERE id = v_row.id;
    RETURN NEW;
  END IF;

  IF v_sender_is_user1 THEN
    v_row.user1_last_message_at := NOW();
    v_other_last := v_row.user2_last_message_at;
  ELSE
    v_row.user2_last_message_at := NOW();
    v_other_last := v_row.user1_last_message_at;
  END IF;

  IF v_other_last IS NOT NULL
     AND v_other_last > NOW() - INTERVAL '24 hours'
     AND (v_row.last_incremented_on IS NULL OR v_row.last_incremented_on < v_today) THEN
    v_row.streak_count := COALESCE(v_row.streak_count, 0) + 1;
    v_row.last_incremented_on := v_today;
    v_row.expiring_notice_sent_at := NULL;
  END IF;

  IF v_row.user1_last_message_at IS NOT NULL AND v_row.user2_last_message_at IS NOT NULL THEN
    v_expires := LEAST(v_row.user1_last_message_at, v_row.user2_last_message_at) + INTERVAL '24 hours';
  ELSE
    v_expires := COALESCE(v_row.user1_last_message_at, v_row.user2_last_message_at) + INTERVAL '24 hours';
  END IF;

  UPDATE public.streaks
  SET streak_count = v_row.streak_count,
      last_message_at = NOW(),
      expires_at = v_expires,
      user1_last_message_at = v_row.user1_last_message_at,
      user2_last_message_at = v_row.user2_last_message_at,
      last_incremented_on = v_row.last_incremented_on,
      expiring_notice_sent_at = v_row.expiring_notice_sent_at
  WHERE id = v_row.id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_expiring_streaks(_horizon_minutes integer DEFAULT 240)
RETURNS TABLE (
  streak_id uuid,
  recipient_profile_id uuid,
  other_profile_id uuid,
  streak_count integer,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id AS streak_id,
    CASE
      WHEN s.user1_last_message_at IS NULL
        OR s.user1_last_message_at <= s.user2_last_message_at
      THEN s.user1_id ELSE s.user2_id
    END AS recipient_profile_id,
    CASE
      WHEN s.user1_last_message_at IS NULL
        OR s.user1_last_message_at <= s.user2_last_message_at
      THEN s.user2_id ELSE s.user1_id
    END AS other_profile_id,
    s.streak_count,
    s.expires_at
  FROM public.streaks s
  WHERE s.streak_count >= 1
    AND s.expires_at > NOW()
    AND s.expires_at <= NOW() + make_interval(mins => _horizon_minutes)
    AND (s.expiring_notice_sent_at IS NULL OR s.expiring_notice_sent_at < s.last_message_at);
$$;

REVOKE EXECUTE ON FUNCTION public.find_expiring_streaks(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_expiring_streaks(integer) TO service_role;
