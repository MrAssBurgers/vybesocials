DO $$
DECLARE
  v_auth uuid;
  v_profile uuid;
BEGIN
  SELECT id INTO v_auth FROM auth.users WHERE lower(email) = 'barron.bakic@gmail.com' LIMIT 1;

  IF v_auth IS NULL THEN
    RAISE NOTICE 'barron.bakic@gmail.com not registered yet — skipping admin grant.';
    RETURN;
  END IF;

  -- auth-keyed role table
  IF to_regclass('public.user_roles_auth') IS NOT NULL THEN
    INSERT INTO public.user_roles_auth (user_id, role)
    VALUES (v_auth, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  -- profile-keyed role table
  SELECT id INTO v_profile FROM public.profiles
    WHERE user_id = v_auth OR id = v_auth LIMIT 1;

  IF v_profile IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_profile, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;