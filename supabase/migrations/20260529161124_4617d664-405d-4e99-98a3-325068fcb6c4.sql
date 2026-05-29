GRANT EXECUTE ON FUNCTION public.is_owner(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_role_for_user(uuid) TO authenticated, service_role, anon;