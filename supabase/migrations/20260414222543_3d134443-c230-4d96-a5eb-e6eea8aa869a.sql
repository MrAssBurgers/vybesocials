CREATE OR REPLACE FUNCTION public.add_user_xp(p_user_id uuid, p_xp integer, p_source text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id uuid;
  v_result jsonb;
BEGIN
  -- Translate: if p_user_id is a profile ID, look up the auth user_id
  SELECT user_id INTO v_auth_id FROM public.profiles WHERE id = p_user_id;
  IF v_auth_id IS NULL THEN
    -- Maybe it's already an auth ID, verify it exists
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
      v_auth_id := p_user_id;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'user not found');
    END IF;
  END IF;

  INSERT INTO public.user_levels (user_id, total_xp, current_level)
  VALUES (v_auth_id, p_xp, 1)
  ON CONFLICT (user_id)
  DO UPDATE SET total_xp = user_levels.total_xp + p_xp, updated_at = now();

  SELECT jsonb_build_object(
    'success', true,
    'user_id', v_auth_id,
    'xp_added', p_xp,
    'source', p_source,
    'total_xp', ul.total_xp,
    'current_level', ul.current_level
  ) INTO v_result
  FROM public.user_levels ul
  WHERE ul.user_id = v_auth_id;

  RETURN COALESCE(v_result, jsonb_build_object('success', false));
END;
$$;