-- 1. Profiles: add phone hash + discoverability opt-in
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_e164_sha256 text,
  ADD COLUMN IF NOT EXISTS contact_discoverable boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_phone_e164_sha256
  ON public.profiles (phone_e164_sha256)
  WHERE phone_e164_sha256 IS NOT NULL;

-- Unique verified phone numbers (allow multiple NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_phone_number_verified
  ON public.profiles (phone_number)
  WHERE phone_verified = true AND phone_number IS NOT NULL;

-- 2. Upgrade phone_verifications for OTP flow
ALTER TABLE public.phone_verifications
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS code_hash text,
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'signup',
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ip text;

ALTER TABLE public.phone_verifications ALTER COLUMN code DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone_purpose
  ON public.phone_verifications (phone, purpose, created_at DESC);

-- 3. Contact hashes uploaded by each user
CREATE TABLE IF NOT EXISTS public.contact_hashes (
  user_id uuid NOT NULL,
  sha256  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sha256)
);
CREATE INDEX IF NOT EXISTS idx_contact_hashes_sha256 ON public.contact_hashes (sha256);

ALTER TABLE public.contact_hashes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners view contact hashes" ON public.contact_hashes;
CREATE POLICY "owners view contact hashes" ON public.contact_hashes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "owners insert contact hashes" ON public.contact_hashes;
CREATE POLICY "owners insert contact hashes" ON public.contact_hashes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "owners delete contact hashes" ON public.contact_hashes;
CREATE POLICY "owners delete contact hashes" ON public.contact_hashes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 4. RPC: match uploaded hashes against discoverable profiles
CREATE OR REPLACE FUNCTION public.match_contacts(hashes text[])
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_verified boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url, p.is_verified
  FROM public.profiles p
  WHERE p.phone_e164_sha256 = ANY(hashes)
    AND p.contact_discoverable = true
    AND p.user_id <> auth.uid()
  LIMIT 500;
$$;

GRANT EXECUTE ON FUNCTION public.match_contacts(text[]) TO authenticated;