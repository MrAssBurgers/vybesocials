
-- 1. Drop track_daily_login first (return type changed)
DROP FUNCTION IF EXISTS public.track_daily_login();

-- 2. Drop all existing overloads of add_user_xp
DROP FUNCTION IF EXISTS public.add_user_xp(uuid, integer);
DROP FUNCTION IF EXISTS public.add_user_xp(uuid, integer, text);

-- 3. Recreate 2-arg add_user_xp
CREATE OR REPLACE FUNCTION public.add_user_xp(p_user_id uuid, p_xp integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  INSERT INTO public.user_levels (user_id, total_xp)
  VALUES (p_user_id, p_xp)
  ON CONFLICT (user_id)
  DO UPDATE SET total_xp = user_levels.total_xp + p_xp,
               updated_at = now();

  SELECT jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'xp_added', p_xp,
    'total_xp', ul.total_xp,
    'current_level', ul.current_level
  ) INTO v_result
  FROM public.user_levels ul
  WHERE ul.user_id = p_user_id;

  RETURN COALESCE(v_result, jsonb_build_object('success', false));
END;
$$;

-- 4. Recreate 3-arg add_user_xp (with source)
CREATE OR REPLACE FUNCTION public.add_user_xp(p_user_id uuid, p_xp integer, p_source text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  INSERT INTO public.user_levels (user_id, total_xp)
  VALUES (p_user_id, p_xp)
  ON CONFLICT (user_id)
  DO UPDATE SET total_xp = user_levels.total_xp + p_xp,
               updated_at = now();

  SELECT jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'xp_added', p_xp,
    'source', p_source,
    'total_xp', ul.total_xp,
    'current_level', ul.current_level
  ) INTO v_result
  FROM public.user_levels ul
  WHERE ul.user_id = p_user_id;

  RETURN COALESCE(v_result, jsonb_build_object('success', false));
END;
$$;

-- 5. Recreate track_daily_login with fix: pass v_auth_id to add_user_xp
CREATE OR REPLACE FUNCTION public.track_daily_login()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id uuid;
  v_profile_id uuid;
  v_today date := current_date;
  v_last_login date;
  v_streak integer;
  v_base_xp integer := 15;
  v_multiplier numeric;
  v_final_xp integer;
  v_level_result jsonb;
  v_challenge_id uuid;
BEGIN
  v_auth_id := auth.uid();
  IF v_auth_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_auth_id;
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_profile');
  END IF;

  SELECT last_login_date, login_streak INTO v_last_login, v_streak
  FROM public.profiles WHERE id = v_profile_id;

  IF v_last_login = v_today THEN
    RETURN jsonb_build_object('success', true, 'already_logged', true);
  END IF;

  IF v_last_login = v_today - 1 THEN
    v_streak := COALESCE(v_streak, 0) + 1;
  ELSE
    v_streak := 1;
  END IF;

  v_multiplier := 1.0 + 0.3 * (v_streak - 1);
  v_final_xp := CEIL(v_base_xp * v_multiplier);

  UPDATE public.profiles
  SET last_login_date = v_today,
      login_streak = v_streak,
      updated_at = now()
  WHERE id = v_profile_id;

  -- FIX: Use auth user ID (v_auth_id) not profile ID, since user_levels.user_id references auth.users
  SELECT public.add_user_xp(v_auth_id, v_final_xp) INTO v_level_result;

  SELECT c.id INTO v_challenge_id
  FROM public.challenges c
  WHERE c.requirement_type = 'daily_login'
    AND c.is_active = true
    AND (c.active_date = v_today OR c.active_date IS NULL)
  LIMIT 1;

  IF v_challenge_id IS NOT NULL THEN
    INSERT INTO public.challenge_progress (user_id, challenge_id, current_count, is_completed, completed_at)
    VALUES (v_profile_id, v_challenge_id, 1, true, now())
    ON CONFLICT (user_id, challenge_id)
    DO UPDATE SET current_count = challenge_progress.current_count + 1,
                  is_completed = true,
                  completed_at = COALESCE(challenge_progress.completed_at, now()),
                  updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'already_logged', false,
    'xp_granted', v_final_xp,
    'streak', v_streak,
    'multiplier', v_multiplier
  );
END;
$$;
