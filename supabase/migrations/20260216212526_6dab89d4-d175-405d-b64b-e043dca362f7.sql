
CREATE OR REPLACE FUNCTION public.get_auth_users_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer FROM auth.users;
$$;
