-- Ensure table exists (idempotent — matches original definition)
CREATE TABLE IF NOT EXISTS public.user_2fa_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_2fa_enabled BOOLEAN NOT NULL DEFAULT false,
  login_approvals_enabled BOOLEAN NOT NULL DEFAULT false,
  backup_codes_hashed TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_2fa_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own 2fa settings"   ON public.user_2fa_settings;
DROP POLICY IF EXISTS "Users update own 2fa settings" ON public.user_2fa_settings;
DROP POLICY IF EXISTS "Users insert own 2fa settings" ON public.user_2fa_settings;
CREATE POLICY "Users view own 2fa settings"   ON public.user_2fa_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own 2fa settings" ON public.user_2fa_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own 2fa settings" ON public.user_2fa_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_2fa_settings_updated_at ON public.user_2fa_settings;
CREATE TRIGGER update_user_2fa_settings_updated_at
  BEFORE UPDATE ON public.user_2fa_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Drop any pre-existing version (from partial deploys) so we can change the return type.
DROP FUNCTION IF EXISTS public.ensure_2fa_settings();

-- Recreate without referencing the table rowtype (which broke prod deploys).
CREATE OR REPLACE FUNCTION public.ensure_2fa_settings()
RETURNS TABLE (
  user_id UUID,
  email_2fa_enabled BOOLEAN,
  login_approvals_enabled BOOLEAN,
  backup_codes_hashed TEXT[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  INSERT INTO public.user_2fa_settings(user_id)
    VALUES (auth.uid())
    ON CONFLICT (user_id) DO NOTHING;
  RETURN QUERY
    SELECT s.user_id, s.email_2fa_enabled, s.login_approvals_enabled,
           s.backup_codes_hashed, s.created_at, s.updated_at
    FROM public.user_2fa_settings s
    WHERE s.user_id = auth.uid();
END;
$$;