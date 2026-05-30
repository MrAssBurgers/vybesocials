-- Preserve the username chosen at email/password signup across profile creation paths.

CREATE OR REPLACE FUNCTION public.normalize_signup_username(p_username text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  v := lower(regexp_replace(btrim(coalesce(p_username, '')), '\s+', '', 'g'));
  IF length(v) < 3 OR v !~ '^[a-z0-9_]+$' THEN
    RETURN NULL;
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_generated_username(p_username text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_username IS NULL
    OR btrim(p_username) = ''
    OR lower(p_username) ~ '^user_[a-f0-9]{6,}(_[a-z0-9]+)?$';
$$;

CREATE OR REPLACE FUNCTION public.resolve_signup_username(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.normalize_signup_username(u.raw_user_meta_data->>'username')
  FROM auth.users u
  WHERE u.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_username text;
BEGIN
  v_username := coalesce(
    public.resolve_signup_username(new.id),
    'user_' || substr(replace(new.id::text, '-', ''), 1, 12)
  );

  INSERT INTO public.profiles (user_id, username, email, bio)
  VALUES (new.id, v_username, new.email, '')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
EXCEPTION WHEN others THEN
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _auth_user_id uuid;
  _profile_id uuid;
  _username text;
  _desired text;
  _retry_count int := 0;
  _max_retries int := 3;
BEGIN
  _auth_user_id := auth.uid();

  IF _auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO _profile_id
  FROM public.profiles
  WHERE user_id = _auth_user_id
  LIMIT 1;

  IF _profile_id IS NOT NULL THEN
    RETURN _profile_id;
  END IF;

  _desired := public.resolve_signup_username(_auth_user_id);

  WHILE _retry_count < _max_retries LOOP
    BEGIN
      IF _desired IS NOT NULL AND _retry_count = 0 THEN
        _username := _desired;
      ELSIF _retry_count = 0 THEN
        _username := 'user_' || substring(replace(_auth_user_id::text, '-', ''), 1, 12);
      ELSE
        _username := 'user_' || substring(replace(_auth_user_id::text, '-', ''), 1, 8) || '_' || _retry_count::text;
      END IF;

      INSERT INTO public.profiles (user_id, username, bio)
      VALUES (_auth_user_id, _username, '')
      ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id INTO _profile_id;

      RETURN _profile_id;
    EXCEPTION WHEN unique_violation THEN
      _retry_count := _retry_count + 1;
      _desired := NULL;
      IF _retry_count >= _max_retries THEN
        _username := 'user_' || extract(epoch FROM now())::bigint::text;
        INSERT INTO public.profiles (user_id, username, bio)
        VALUES (_auth_user_id, _username, '')
        ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING id INTO _profile_id;
        RETURN _profile_id;
      END IF;
    END;
  END LOOP;

  RETURN NULL;
END;
$$;

-- Repair profiles that got a generated username despite signup metadata.
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
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RETURN NULL;
  END IF;

  _desired := public.resolve_signup_username(_uid);
  IF _desired IS NULL THEN
    SELECT username INTO _current FROM public.profiles WHERE user_id = _uid LIMIT 1;
    RETURN _current;
  END IF;

  SELECT username INTO _current FROM public.profiles WHERE user_id = _uid LIMIT 1;

  IF _current IS NOT NULL AND lower(_current) = _desired THEN
    RETURN _current;
  END IF;

  IF _current IS NOT NULL AND NOT public.is_generated_username(_current) THEN
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
     AND (public.is_generated_username(username) OR username IS NULL);

  RETURN _desired;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_signup_username() TO authenticated;
