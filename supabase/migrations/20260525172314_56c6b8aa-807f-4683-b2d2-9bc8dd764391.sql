
-- ============ Challenge progress hardening ============
DROP POLICY IF EXISTS "Users can manage own challenge progress" ON public.challenge_progress;
DROP POLICY IF EXISTS "Users can update own challenge progress" ON public.challenge_progress;
DROP POLICY IF EXISTS "Users can view own challenge progress" ON public.challenge_progress;
DROP POLICY IF EXISTS "Users can update own challenge progress count" ON public.challenge_progress;

CREATE POLICY "cp_select_own"
  ON public.challenge_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.current_profile_id() = user_id);

-- No INSERT / UPDATE / DELETE policies for end-users.
-- All writes go through SECURITY DEFINER functions
-- (increment_challenge_progress, sync_my_challenge_progress, rotate_challenges, claim_challenge_reward).

-- RPC the client uses to bump progress safely
CREATE OR REPLACE FUNCTION public.increment_challenge_progress(
  p_challenge_id uuid,
  p_increment integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id uuid := auth.uid();
  v_profile_id uuid;
  v_challenge RECORD;
  v_existing RECORD;
  v_new_count integer;
  v_is_completed boolean;
  v_was_already_completed boolean := false;
BEGIN
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_increment IS NULL OR p_increment < 1 OR p_increment > 100 THEN
    p_increment := 1;
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_auth_id;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No profile';
  END IF;

  SELECT * INTO v_challenge FROM public.challenges
   WHERE id = p_challenge_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found or inactive';
  END IF;

  SELECT * INTO v_existing FROM public.challenge_progress
   WHERE user_id = v_profile_id AND challenge_id = p_challenge_id;

  IF v_existing.id IS NOT NULL AND v_existing.is_completed THEN
    RETURN jsonb_build_object(
      'is_completed', true,
      'new_count', v_existing.current_count,
      'was_already_completed', true
    );
  END IF;

  v_new_count := COALESCE(v_existing.current_count, 0) + p_increment;
  v_is_completed := v_new_count >= COALESCE(v_challenge.requirement_count, 1);

  INSERT INTO public.challenge_progress (
    user_id, challenge_id, current_count, is_completed, completed_at, updated_at
  ) VALUES (
    v_profile_id, p_challenge_id, v_new_count, v_is_completed,
    CASE WHEN v_is_completed THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (user_id, challenge_id) DO UPDATE SET
    current_count = EXCLUDED.current_count,
    is_completed = EXCLUDED.is_completed,
    completed_at = COALESCE(public.challenge_progress.completed_at, EXCLUDED.completed_at),
    updated_at = now();

  RETURN jsonb_build_object(
    'is_completed', v_is_completed,
    'new_count', v_new_count,
    'was_already_completed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.increment_challenge_progress(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_challenge_progress(uuid, integer) TO authenticated;

-- ============ user_levels: remove direct writes ============
DROP POLICY IF EXISTS "Users can insert their own level" ON public.user_levels;
DROP POLICY IF EXISTS "Users can update their own level" ON public.user_levels;

-- ============ user_badges: remove self-award ============
DROP POLICY IF EXISTS "System can insert badges" ON public.user_badges;

-- ============ Storage: chat-media bucket ============
DROP POLICY IF EXISTS "Chat media is publicly viewable" ON storage.objects;

-- ============ Storage: announcements bucket ============
DROP POLICY IF EXISTS "Authenticated users can upload announcement media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update announcement media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete announcement media" ON storage.objects;
