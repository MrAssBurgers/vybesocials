CREATE OR REPLACE FUNCTION public.get_my_highest_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id uuid := auth.uid();
  v_profile_id uuid;
  v_roles text[];
BEGIN
  IF v_auth_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_auth_id LIMIT 1;

  SELECT array_agg(role::text) INTO v_roles FROM (
    SELECT role::text FROM public.user_roles_auth WHERE user_id = v_auth_id
    UNION ALL
    SELECT role::text FROM public.user_roles WHERE user_id = v_profile_id
  ) r;

  IF v_roles IS NULL THEN RETURN NULL; END IF;
  IF 'owner' = ANY(v_roles) THEN RETURN 'owner'; END IF;
  IF 'admin' = ANY(v_roles) THEN RETURN 'admin'; END IF;
  IF 'moderator' = ANY(v_roles) THEN RETURN 'moderator'; END IF;
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_highest_role() TO authenticated;