
CREATE OR REPLACE FUNCTION public.get_my_highest_role()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    UNION ALL
    -- Staff badges grant the equivalent role for admin-panel access.
    -- user_badges.user_id stores the auth.users.id.
    SELECT CASE b.name
             WHEN 'Owner'     THEN 'owner'
             WHEN 'Admin'     THEN 'admin'
             WHEN 'Moderator' THEN 'moderator'
           END
    FROM public.user_badges ub
    JOIN public.badges b ON b.id = ub.badge_id
    WHERE ub.user_id = v_auth_id
      AND b.is_staff_badge = true
      AND b.name IN ('Owner','Admin','Moderator')
  ) r;

  IF v_roles IS NULL THEN RETURN NULL; END IF;
  IF 'owner' = ANY(v_roles) THEN RETURN 'owner'; END IF;
  IF 'admin' = ANY(v_roles) THEN RETURN 'admin'; END IF;
  IF 'moderator' = ANY(v_roles) THEN RETURN 'moderator'; END IF;
  RETURN NULL;
END;
$function$;
