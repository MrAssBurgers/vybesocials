
ALTER TABLE public.live_music_presence
  ADD COLUMN IF NOT EXISTS tempo numeric,
  ADD COLUMN IF NOT EXISTS energy numeric;

CREATE OR REPLACE FUNCTION public.update_2fa_settings(
  p_email_2fa boolean,
  p_login_approvals boolean
)
RETURNS TABLE(email_2fa_enabled boolean, login_approvals_enabled boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.user_2fa_settings (user_id, email_2fa_enabled, login_approvals_enabled)
  VALUES (v_uid, COALESCE(p_email_2fa, false), COALESCE(p_login_approvals, false))
  ON CONFLICT (user_id) DO UPDATE
    SET email_2fa_enabled = COALESCE(EXCLUDED.email_2fa_enabled, public.user_2fa_settings.email_2fa_enabled),
        login_approvals_enabled = COALESCE(EXCLUDED.login_approvals_enabled, public.user_2fa_settings.login_approvals_enabled),
        updated_at = now();

  RETURN QUERY
    SELECT s.email_2fa_enabled, s.login_approvals_enabled
    FROM public.user_2fa_settings s
    WHERE s.user_id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_2fa_settings(boolean, boolean) TO authenticated;
