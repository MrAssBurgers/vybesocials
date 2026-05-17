
-- 1) Post deletion audit log
CREATE TABLE IF NOT EXISTS public.post_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  author_id uuid,
  deleted_by uuid NOT NULL,
  post_type text,
  caption text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_deletion_log_created_at
  ON public.post_deletion_log (created_at DESC);

ALTER TABLE public.post_deletion_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can log their own deletions" ON public.post_deletion_log;
CREATE POLICY "Users can log their own deletions"
ON public.post_deletion_log
FOR INSERT
TO authenticated
WITH CHECK (
  deleted_by IN (
    SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins and mods can view deletion log" ON public.post_deletion_log;
CREATE POLICY "Admins and mods can view deletion log"
ON public.post_deletion_log
FOR SELECT
TO authenticated
USING (
  public.has_role(public.current_profile_id(), 'admin'::public.app_role)
  OR public.has_role(public.current_profile_id(), 'moderator'::public.app_role)
);

-- 2) Fix update_2fa_settings: use values directly so turning OFF persists
CREATE OR REPLACE FUNCTION public.update_2fa_settings(
  p_email_2fa boolean,
  p_login_approvals boolean
)
RETURNS TABLE (email_2fa_enabled boolean, login_approvals_enabled boolean)
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
    SET email_2fa_enabled = COALESCE(p_email_2fa, public.user_2fa_settings.email_2fa_enabled),
        login_approvals_enabled = COALESCE(p_login_approvals, public.user_2fa_settings.login_approvals_enabled),
        updated_at = now();

  RETURN QUERY
    SELECT s.email_2fa_enabled, s.login_approvals_enabled
    FROM public.user_2fa_settings s
    WHERE s.user_id = v_uid;
END;
$$;
