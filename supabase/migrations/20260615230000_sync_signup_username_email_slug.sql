-- Repair profiles stuck on email-slug usernames when signup metadata has the real handle.

CREATE OR REPLACE FUNCTION public.is_email_derived_username(p_username text, p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_username IS NOT NULL
    AND p_email IS NOT NULL
    AND lower(regexp_replace(btrim(p_username), '[^a-z0-9]', '', 'gi'))
      = lower(regexp_replace(split_part(p_email, '@', 1), '[^a-z0-9]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.sync_signup_username()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _uid uuid;
  _desired text;
  _current text;
  _email text;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  _desired := public.resolve_signup_username(_uid);
  IF _desired IS NULL THEN
    SELECT username INTO _current FROM public.profiles WHERE user_id = _uid LIMIT 1;
    RETURN _current;
  END IF;

  SELECT username INTO _current FROM public.profiles WHERE user_id = _uid LIMIT 1;

  IF _current IS NOT NULL AND lower(_current) = _desired THEN
    RETURN _current;
  END IF;

  IF _current IS NOT NULL
     AND NOT public.is_generated_username(_current)
     AND NOT public.is_email_derived_username(_current, _email) THEN
    RETURN _current;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE lower(p.username) = _desired AND p.user_id <> _uid
  ) THEN
    RETURN _current;
  END IF;

  UPDATE public.profiles
     SET username = _desired
   WHERE user_id = _uid
     AND (
       public.is_generated_username(username)
       OR username IS NULL
       OR public.is_email_derived_username(username, _email)
     );

  RETURN _desired;
END;
$$;
