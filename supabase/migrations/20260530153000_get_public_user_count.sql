-- Public profile count for marketing page (anon cannot SELECT profiles directly).
CREATE OR REPLACE FUNCTION public.get_public_user_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint FROM public.profiles;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_user_count() TO anon, authenticated;
