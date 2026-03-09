
CREATE OR REPLACE FUNCTION public.compute_vybe_dna()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _post_count int;
  _like_count int;
  _comment_count int;
  _message_count int;
  _login_streak int;
  _interaction_count int;
  _activity_raw float;
  _social_raw float;
  _creative_raw float;
  _activity float;
  _social float;
  _creative float;
  _result jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Creative signals: posts created
  SELECT count(*) INTO _post_count
  FROM posts WHERE user_id = _uid;

  -- Social signals: likes given + comments made + messages sent
  SELECT count(*) INTO _like_count
  FROM likes WHERE user_id = _uid;

  SELECT count(*) INTO _comment_count
  FROM comments WHERE user_id = _uid;

  SELECT count(*) INTO _message_count
  FROM messages WHERE sender_id = _uid;

  -- Activity signals: interactions + login events
  SELECT count(*) INTO _interaction_count
  FROM user_interactions WHERE user_id = _uid;

  SELECT COALESCE(login_streak, 0) INTO _login_streak
  FROM profiles WHERE user_id = _uid;

  -- Raw scores (logarithmic scaling for natural feel)
  _creative_raw := ln(greatest(_post_count, 1)::float + 1);
  _social_raw := ln(greatest(_like_count + _comment_count + _message_count, 1)::float + 1);
  _activity_raw := ln(greatest(_interaction_count + (_login_streak * 5), 1)::float + 1);

  -- Normalize to 0-1 using sigmoid-like mapping (tanh), tuned so ~50 actions ≈ 0.5
  _creative := (tanh((_creative_raw / 4.0) - 0.5) + 1) / 2;
  _social := (tanh((_social_raw / 5.0) - 0.5) + 1) / 2;
  _activity := (tanh((_activity_raw / 5.0) - 0.5) + 1) / 2;

  -- Upsert into vybe_dna
  INSERT INTO vybe_dna (user_id, personality_vector, aura_intensity, updated_at, generated_at)
  VALUES (
    _uid,
    jsonb_build_object('activity', round(_activity::numeric, 4), 'social', round(_social::numeric, 4), 'creative', round(_creative::numeric, 4)),
    round(((_activity + _social + _creative) / 3)::numeric, 4),
    now(),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    personality_vector = EXCLUDED.personality_vector,
    aura_intensity = EXCLUDED.aura_intensity,
    updated_at = now();

  -- Return the computed data
  SELECT jsonb_build_object(
    'activity', round(_activity::numeric, 4),
    'social', round(_social::numeric, 4),
    'creative', round(_creative::numeric, 4),
    'post_count', _post_count,
    'like_count', _like_count,
    'comment_count', _comment_count,
    'message_count', _message_count,
    'login_streak', _login_streak
  ) INTO _result;

  RETURN _result;
END;
$$;
