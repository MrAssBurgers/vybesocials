-- Security hardening: set immutable search_path on function
-- Fixes linter warning: Function Search Path Mutable (0011)

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT upper(substring(md5(random()::text) from 1 for 8))
$$;