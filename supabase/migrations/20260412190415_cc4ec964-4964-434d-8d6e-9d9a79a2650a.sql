
-- Drop existing overloads to avoid return type conflicts
DROP FUNCTION IF EXISTS public.add_user_xp(uuid, integer);

CREATE OR REPLACE FUNCTION public.add_user_xp(p_user_id uuid, p_xp integer)
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
      -- Neither profile nor auth ID found, skip gracefully
      RETURN jsonb_build_object('success', false, 'error', 'user not found');
    END IF;
  END IF;

  INSERT INTO public.user_levels (user_id, total_xp, current_level)
  VALUES (v_auth_id, p_xp, 1)
  ON CONFLICT (user_id)
  DO UPDATE SET total_xp = user_levels.total_xp + p_xp, updated_at = now();

  SELECT jsonb_build_object('success', true, 'xp_added', p_xp) INTO v_result;
  RETURN v_result;
END;
$$;
