
-- ============ 2FA SETTINGS ============
CREATE TABLE public.user_2fa_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_2fa_enabled BOOLEAN NOT NULL DEFAULT false,
  login_approvals_enabled BOOLEAN NOT NULL DEFAULT false,
  backup_codes_hashed TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_2fa_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own 2fa settings" ON public.user_2fa_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own 2fa settings" ON public.user_2fa_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own 2fa settings" ON public.user_2fa_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============ AUTH CHALLENGES (email codes, login approvals, QR handshakes) ============
CREATE TABLE public.auth_challenges (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('email_2fa','login_approval','qr_signin')),
  code_hash TEXT,
  nonce TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','consumed','expired')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_auth_challenges_user ON public.auth_challenges(user_id, challenge_type, status);
CREATE INDEX idx_auth_challenges_nonce ON public.auth_challenges(nonce);
CREATE INDEX idx_auth_challenges_expires ON public.auth_challenges(expires_at);
ALTER TABLE public.auth_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own challenges" ON public.auth_challenges FOR SELECT USING (auth.uid() = user_id);

-- ============ PASSKEYS ============
CREATE TABLE public.user_passkeys (
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
CREATE INDEX idx_user_passkeys_user ON public.user_passkeys(user_id);
ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own passkeys" ON public.user_passkeys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users delete own passkeys" ON public.user_passkeys FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users update own passkeys" ON public.user_passkeys FOR UPDATE USING (auth.uid() = user_id);

-- ============ SESSIONS / DEVICES ============
CREATE TABLE public.user_sessions (
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
CREATE INDEX idx_user_sessions_user ON public.user_sessions(user_id, revoked_at);
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own sessions" ON public.user_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users revoke own sessions" ON public.user_sessions FOR UPDATE USING (auth.uid() = user_id);

-- ============ LOGIN HISTORY ============
CREATE TABLE public.login_history (
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
CREATE INDEX idx_login_history_user ON public.login_history(user_id, created_at DESC);
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own login history" ON public.login_history FOR SELECT USING (auth.uid() = user_id);

-- ============ TIMESTAMPS TRIGGER ============
CREATE TRIGGER update_user_2fa_settings_updated_at
  BEFORE UPDATE ON public.user_2fa_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.auth_challenges;
ALTER TABLE public.auth_challenges REPLICA IDENTITY FULL;

-- ============ HELPER: enable 2FA settings row on demand ============
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
