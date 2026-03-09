
-- Drop existing functions with old return types
DROP FUNCTION IF EXISTS public.bump_reaction_streak(UUID);
DROP FUNCTION IF EXISTS public.find_roulette_match(TEXT, TEXT[]);

-- Recreate bump_reaction_streak returning JSONB
CREATE OR REPLACE FUNCTION public.bump_reaction_streak(p_other_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_a UUID;
  v_b UUID;
  v_current INT;
  v_longest INT;
  v_hours_since FLOAT;
  v_last_a TIMESTAMPTZ;
  v_last_b TIMESTAMPTZ;
BEGIN
  IF v_me < p_other_user THEN v_a := v_me; v_b := p_other_user;
  ELSE v_a := p_other_user; v_b := v_me; END IF;

  INSERT INTO public.reaction_streaks (user_a, user_b, current_streak, longest_streak, last_interaction_at, streak_started_at)
  VALUES (v_a, v_b, 0, 0, now(), now())
  ON CONFLICT (user_a, user_b) DO NOTHING;

  SELECT rs.current_streak, rs.longest_streak,
         EXTRACT(EPOCH FROM (now() - rs.last_interaction_at)) / 3600.0,
         rs.last_user_a_at, rs.last_user_b_at
  INTO v_current, v_longest, v_hours_since, v_last_a, v_last_b
  FROM public.reaction_streaks rs
  WHERE rs.user_a = v_a AND rs.user_b = v_b FOR UPDATE;

  IF v_me = v_a THEN v_last_a := now(); ELSE v_last_b := now(); END IF;

  IF v_last_a IS NOT NULL AND v_last_b IS NOT NULL
     AND (now() - LEAST(v_last_a, v_last_b)) < INTERVAL '48 hours'
  THEN
    IF v_hours_since > 48 THEN v_current := 1; ELSE v_current := v_current + 1; END IF;
    v_last_a := NULL; v_last_b := NULL;
  END IF;

  IF v_current > v_longest THEN v_longest := v_current; END IF;

  UPDATE public.reaction_streaks SET
    current_streak = v_current, longest_streak = v_longest,
    last_interaction_at = now(), last_user_a_at = v_last_a,
    last_user_b_at = v_last_b, updated_at = now()
  WHERE user_a = v_a AND user_b = v_b;

  RETURN jsonb_build_object('current_streak', v_current, 'longest_streak', v_longest);
END;
$$;

-- Recreate find_roulette_match returning JSONB
CREATE OR REPLACE FUNCTION public.find_roulette_match(p_mode TEXT DEFAULT 'text', p_interests TEXT[] DEFAULT '{}')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_match_user UUID;
  v_match_id UUID;
BEGIN
  DELETE FROM public.roulette_queue WHERE user_id = v_me;

  SELECT rq.user_id INTO v_match_user
  FROM public.roulette_queue rq
  WHERE rq.user_id != v_me AND rq.mode = p_mode
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users bu
      WHERE (bu.blocker_id = v_me AND bu.blocked_id = rq.user_id)
         OR (bu.blocker_id = rq.user_id AND bu.blocked_id = v_me))
  ORDER BY COALESCE(array_length(ARRAY(SELECT unnest(rq.interests) INTERSECT SELECT unnest(p_interests)), 1), 0) DESC, rq.joined_at ASC
  LIMIT 1;

  IF v_match_user IS NULL THEN
    INSERT INTO public.roulette_queue (user_id, interests, mode)
    VALUES (v_me, p_interests, p_mode)
    ON CONFLICT (user_id) DO UPDATE SET interests = p_interests, mode = p_mode, joined_at = now();
    RETURN jsonb_build_object('matched', false);
  END IF;

  DELETE FROM public.roulette_queue WHERE user_id = v_match_user;

  INSERT INTO public.roulette_matches (user_a, user_b, mode, shared_interests, status)
  VALUES (LEAST(v_me, v_match_user), GREATEST(v_me, v_match_user), p_mode, '{}', 'active')
  RETURNING id INTO v_match_id;

  RETURN jsonb_build_object('matched', true, 'match_id', v_match_id, 'partner_id', v_match_user);
END;
$$;
