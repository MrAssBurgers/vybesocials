CREATE OR REPLACE FUNCTION public.get_staff_role_for_user(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_auth_ids uuid[];
  v_profile_ids uuid[];
  v_roles text[];
BEGIN
  IF _user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(
      ARRAY[_user_id] ||
      COALESCE((
        SELECT array_agg(p.user_id)
        FROM public.profiles p
        WHERE p.id = _user_id OR p.user_id = _user_id
      ), ARRAY[]::uuid[])
    ) AS x
    WHERE x IS NOT NULL
  ) INTO v_auth_ids;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(
      ARRAY[_user_id] ||
      COALESCE((
        SELECT array_agg(p.id)
        FROM public.profiles p
        WHERE p.id = _user_id OR p.user_id = _user_id
      ), ARRAY[]::uuid[])
    ) AS x
    WHERE x IS NOT NULL
  ) INTO v_profile_ids;

  SELECT array_agg(role) INTO v_roles
  FROM (
    SELECT role::text AS role
    FROM public.user_roles_auth
    WHERE user_id = ANY(v_auth_ids)

    UNION ALL

    SELECT role::text AS role
    FROM public.user_roles
    WHERE user_id = ANY(v_profile_ids)
       OR user_id = ANY(v_auth_ids)

    UNION ALL

    SELECT CASE
      WHEN lower(COALESCE(b.name, ub.badge_name, ub.badge_type)) IN ('owner', 'owner''s wife', 'owner_wife') THEN 'owner'
      WHEN lower(COALESCE(b.name, ub.badge_name, ub.badge_type)) = 'admin' THEN 'admin'
      WHEN lower(COALESCE(b.name, ub.badge_name, ub.badge_type)) IN ('moderator', 'mod') THEN 'moderator'
      ELSE NULL
    END AS role
    FROM public.user_badges ub
    LEFT JOIN public.badges b ON b.id = ub.badge_id
    WHERE (ub.user_id = ANY(v_auth_ids) OR ub.user_id = ANY(v_profile_ids))
      AND (ub.expires_at IS NULL OR ub.expires_at > now())
      AND (
        b.is_staff_badge = true
        OR ub.badge_type = 'role'
        OR lower(COALESCE(b.name, ub.badge_name, ub.badge_type)) IN ('owner', 'owner''s wife', 'owner_wife', 'admin', 'moderator', 'mod')
      )
  ) r
  WHERE role IS NOT NULL;

  IF v_roles IS NULL THEN
    RETURN NULL;
  END IF;

  IF 'owner' = ANY(v_roles) OR 'owner_wife' = ANY(v_roles) THEN RETURN 'owner'; END IF;
  IF 'admin' = ANY(v_roles) THEN RETURN 'admin'; END IF;
  IF 'moderator' = ANY(v_roles) THEN RETURN 'moderator'; END IF;
  RETURN NULL;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_staff_role_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_role_for_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_highest_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.get_staff_role_for_user(auth.uid())
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_highest_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_highest_role() TO service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE
    WHEN _role = 'owner'::app_role THEN public.get_staff_role_for_user(_user_id) = 'owner'
    WHEN _role = 'admin'::app_role THEN public.get_staff_role_for_user(_user_id) IN ('owner', 'admin')
    WHEN _role = 'moderator'::app_role THEN public.get_staff_role_for_user(_user_id) IN ('owner', 'admin', 'moderator')
    WHEN _role = 'owner_wife'::app_role THEN public.get_staff_role_for_user(_user_id) = 'owner'
    ELSE false
  END
$function$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;

CREATE OR REPLACE FUNCTION public.current_user_has_role(_role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.has_role(auth.uid(), _role)
$function$;

GRANT EXECUTE ON FUNCTION public.current_user_has_role(app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(app_role) TO service_role;

CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.get_staff_role_for_user(_user_id) = 'owner'
$function$;

GRANT EXECUTE ON FUNCTION public.is_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.get_staff_role_for_user(_user_id) IN ('owner', 'admin')
$function$;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;