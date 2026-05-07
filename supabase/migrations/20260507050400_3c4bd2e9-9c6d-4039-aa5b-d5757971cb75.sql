
-- Idempotent re-apply of auth security tables (Live deploy was rolling back).

CREATE TABLE IF NOT EXISTS public.user_2fa_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_2fa_enabled BOOLEAN NOT NULL DEFAULT false,
  login_approvals_enabled BOOLEAN NOT NULL DEFAULT false,
  backup_codes_hashed TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_2fa_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own 2fa settings" ON public.user_2fa_settings;
DROP POLICY IF EXISTS "Users update own 2fa settings" ON public.user_2fa_settings;
DROP POLICY IF EXISTS "Users insert own 2fa settings" ON public.user_2fa_settings;
CREATE POLICY "Users view own 2fa settings"   ON public.user_2fa_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own 2fa settings" ON public.user_2fa_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own 2fa settings" ON public.user_2fa_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.auth_challenges (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  challenge_type TEXT NOT NULL,
  code_hash TEXT,
  nonce TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.auth_challenges DROP CONSTRAINT IF EXISTS auth_challenges_challenge_type_check;
ALTER TABLE public.auth_challenges ADD CONSTRAINT auth_challenges_challenge_type_check
  CHECK (challenge_type = ANY (ARRAY['email_2fa','login_approval','qr_signin','passkey_register','passkey_login']));
ALTER TABLE public.auth_challenges DROP CONSTRAINT IF EXISTS auth_challenges_status_check;
ALTER TABLE public.auth_challenges ADD CONSTRAINT auth_challenges_status_check
  CHECK (status = ANY (ARRAY['pending','approved','denied','consumed','expired']));
CREATE INDEX IF NOT EXISTS idx_auth_challenges_user ON public.auth_challenges(user_id, challenge_type, status);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_nonce ON public.auth_challenges(nonce);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires ON public.auth_challenges(expires_at);
ALTER TABLE public.auth_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own challenges" ON public.auth_challenges;
CREATE POLICY "Users view own challenges" ON public.auth_challenges FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.user_passkeys (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NOT NULL DEFAULT '{}',
  device_name TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_user ON public.user_passkeys(user_id);
ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own passkeys"   ON public.user_passkeys;
DROP POLICY IF EXISTS "Users delete own passkeys" ON public.user_passkeys;
DROP POLICY IF EXISTS "Users update own passkeys" ON public.user_passkeys;
CREATE POLICY "Users view own passkeys"   ON public.user_passkeys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users delete own passkeys" ON public.user_passkeys FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users update own passkeys" ON public.user_passkeys FOR UPDATE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token_hash TEXT,
  device_label TEXT,
  user_agent TEXT,
  ip TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  trusted BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions(user_id, revoked_at);
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own sessions"  ON public.user_sessions;
DROP POLICY IF EXISTS "Users revoke own sessions" ON public.user_sessions;
CREATE POLICY "Users view own sessions"   ON public.user_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users revoke own sessions" ON public.user_sessions FOR UPDATE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.login_history (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  ip TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  user_agent TEXT,
  device_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_history_user ON public.login_history(user_id, created_at DESC);
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own login history" ON public.login_history;
CREATE POLICY "Users view own login history" ON public.login_history FOR SELECT USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_2fa_settings_updated_at ON public.user_2fa_settings;
CREATE TRIGGER update_user_2fa_settings_updated_at
  BEFORE UPDATE ON public.user_2fa_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.auth_challenges REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.auth_challenges;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.ensure_2fa_settings()
RETURNS public.user_2fa_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.user_2fa_settings;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  INSERT INTO public.user_2fa_settings(user_id)
    VALUES (auth.uid())
    ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO rec FROM public.user_2fa_settings WHERE user_id = auth.uid();
  RETURN rec;
END;
$$;
