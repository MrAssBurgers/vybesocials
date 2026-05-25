
DO $$
DECLARE p text;
BEGIN
  FOR p IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'storage.objects'::regclass
      AND polname IN (
        'Chat media is publicly viewable',
        'Public can view chat media',
        'Anyone can view chat media',
        'Chat media public read'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p);
  END LOOP;
END $$;

UPDATE storage.buckets SET public = false WHERE id = 'chat-media';

DROP POLICY IF EXISTS "Authenticated users can upload announcement media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update announcement media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete announcement media" ON storage.objects;

UPDATE storage.buckets SET public = false WHERE id = 'announcements';

CREATE OR REPLACE FUNCTION public.ensure_user_level_for_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_levels (user_id)
  VALUES (NEW.user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_user_level ON public.profiles;
CREATE TRIGGER trg_ensure_user_level
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_user_level_for_profile();

CREATE OR REPLACE FUNCTION public.ensure_user_level()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _auth_uid uuid := auth.uid();
BEGIN
  IF _auth_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  INSERT INTO public.user_levels (user_id)
  VALUES (_auth_uid)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_level() TO authenticated;

CREATE OR REPLACE FUNCTION public.award_invite_badge(p_milestone integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _auth_uid uuid := auth.uid();
  _count integer;
  _badge_name text;
  _badge_type text;
BEGIN
  IF _auth_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_milestone NOT IN (1, 3, 10) THEN
    RAISE EXCEPTION 'invalid milestone';
  END IF;

  SELECT COALESCE(SUM(use_count), 0) INTO _count
  FROM public.invites
  WHERE inviter_id = _auth_uid;

  IF _count < p_milestone THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'milestone_not_reached', 'count', _count);
  END IF;

  _badge_type := 'invite_' || p_milestone::text;
  _badge_name := CASE p_milestone
    WHEN 1 THEN 'First Invite'
    WHEN 3 THEN 'Rising Star'
    WHEN 10 THEN 'Early Builder'
  END;

  IF EXISTS (
    SELECT 1 FROM public.user_badges
    WHERE user_id = _auth_uid AND badge_type = _badge_type
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_awarded', true);
  END IF;

  INSERT INTO public.user_badges (user_id, badge_type, badge_name, metadata)
  VALUES (_auth_uid, _badge_type, _badge_name, jsonb_build_object('invites', p_milestone));

  RETURN jsonb_build_object('ok', true, 'awarded', _badge_type);
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_invite_badge(integer) TO authenticated;
