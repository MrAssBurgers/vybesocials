-- Fix VYBE DNA aggregation to use the current user's profile-backed activity tables
CREATE OR REPLACE FUNCTION public.compute_vybe_dna()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _auth_uid uuid := auth.uid();
  _profile_id uuid;
  _post_count int := 0;
  _like_count int := 0;
  _comment_count int := 0;
  _message_count int := 0;
  _interaction_count int := 0;
  _activity_raw float := 0;
  _social_raw float := 0;
  _creative_raw float := 0;
  _activity float := 0;
  _social float := 0;
  _creative float := 0;
  _result jsonb;
BEGIN
  IF _auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO _profile_id
  FROM public.profiles
  WHERE user_id = _auth_uid
  LIMIT 1;

  IF _profile_id IS NULL THEN
    RETURN jsonb_build_object(
      'activity', 0,
      'social', 0,
      'creative', 0,
      'post_count', 0,
      'like_count', 0,
      'comment_count', 0,
      'message_count', 0,
      'interaction_count', 0
    );
  END IF;

  SELECT count(*) INTO _post_count
  FROM public.posts
  WHERE author_id = _profile_id;

  SELECT count(*) INTO _like_count
  FROM public.likes
  WHERE user_id = _profile_id;

  SELECT count(*) INTO _comment_count
  FROM public.comments
  WHERE user_id = _profile_id;

  SELECT count(*) INTO _message_count
  FROM public.messages
  WHERE sender_id = _profile_id;

  SELECT count(*) INTO _interaction_count
  FROM public.user_interactions
  WHERE user_id = _profile_id;

  _creative_raw := ln(greatest(_post_count, 1)::float + 1);
  _social_raw := ln(greatest(_like_count + _comment_count + _message_count, 1)::float + 1);
  _activity_raw := ln(greatest(_interaction_count, 1)::float + 1);

  _creative := (tanh((_creative_raw / 4.0) - 0.5) + 1) / 2;
  _social := (tanh((_social_raw / 5.0) - 0.5) + 1) / 2;
  _activity := (tanh((_activity_raw / 5.0) - 0.5) + 1) / 2;

  INSERT INTO public.vybe_dna (user_id, personality_vector, aura_intensity, updated_at, generated_at)
  VALUES (
    _auth_uid,
    jsonb_build_object(
      'activity', round(_activity::numeric, 4),
      'social', round(_social::numeric, 4),
      'creative', round(_creative::numeric, 4)
    ),
    round(((_activity + _social + _creative) / 3)::numeric, 4),
    now(),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    personality_vector = EXCLUDED.personality_vector,
    aura_intensity = EXCLUDED.aura_intensity,
    updated_at = now();

  SELECT jsonb_build_object(
    'activity', round(_activity::numeric, 4),
    'social', round(_social::numeric, 4),
    'creative', round(_creative::numeric, 4),
    'post_count', _post_count,
    'like_count', _like_count,
    'comment_count', _comment_count,
    'message_count', _message_count,
    'interaction_count', _interaction_count
  ) INTO _result;

  RETURN _result;
END;
$$;

-- Store reaction streaks against profile ids instead of auth ids
ALTER TABLE public.reaction_streaks
  DROP CONSTRAINT IF EXISTS reaction_streaks_user_a_fkey,
  DROP CONSTRAINT IF EXISTS reaction_streaks_user_b_fkey;

ALTER TABLE public.reaction_streaks
  ADD CONSTRAINT reaction_streaks_user_a_fkey
    FOREIGN KEY (user_a) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT reaction_streaks_user_b_fkey
    FOREIGN KEY (user_b) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.bump_reaction_streak(p_other_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_me uuid;
  v_a uuid;
  v_b uuid;
  v_current int := 0;
  v_longest int := 0;
  v_hours_since float := 0;
  v_last_a timestamptz;
  v_last_b timestamptz;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_me
  FROM public.profiles
  WHERE user_id = v_auth_uid
  LIMIT 1;

  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF p_other_user IS NULL OR p_other_user = v_me THEN
    RETURN jsonb_build_object('current_streak', 0, 'longest_streak', 0);
  END IF;

  IF v_me < p_other_user THEN
    v_a := v_me;
    v_b := p_other_user;
  ELSE
    v_a := p_other_user;
    v_b := v_me;
  END IF;

  INSERT INTO public.reaction_streaks (
    user_a,
    user_b,
    current_streak,
    longest_streak,
    last_interaction_at,
    streak_started_at
  )
  VALUES (v_a, v_b, 0, 0, now(), now())
  ON CONFLICT (user_a, user_b) DO NOTHING;

  SELECT
    rs.current_streak,
    rs.longest_streak,
    EXTRACT(EPOCH FROM (now() - rs.last_interaction_at)) / 3600.0,
    rs.last_user_a_at,
    rs.last_user_b_at
  INTO v_current, v_longest, v_hours_since, v_last_a, v_last_b
  FROM public.reaction_streaks rs
  WHERE rs.user_a = v_a AND rs.user_b = v_b
  FOR UPDATE;

  IF v_me = v_a THEN
    v_last_a := now();
  ELSE
    v_last_b := now();
  END IF;

  IF v_last_a IS NOT NULL
     AND v_last_b IS NOT NULL
     AND (now() - LEAST(v_last_a, v_last_b)) < interval '48 hours'
  THEN
    IF v_hours_since > 48 THEN
      v_current := 1;
    ELSE
      v_current := v_current + 1;
    END IF;

    v_last_a := NULL;
    v_last_b := NULL;
  END IF;

  IF v_current > v_longest THEN
    v_longest := v_current;
  END IF;

  UPDATE public.reaction_streaks
  SET
    current_streak = v_current,
    longest_streak = v_longest,
    last_interaction_at = now(),
    last_user_a_at = v_last_a,
    last_user_b_at = v_last_b,
    updated_at = now()
  WHERE user_a = v_a AND user_b = v_b;

  RETURN jsonb_build_object('current_streak', v_current, 'longest_streak', v_longest);
END;
$$;