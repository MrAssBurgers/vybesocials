
-- 1. Remove overly-permissive INSERT policy on 'media' bucket (path-scoped policy remains)
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;

-- 2. Create oauth_nonces table for Spotify OAuth CSRF protection
CREATE TABLE IF NOT EXISTS public.oauth_nonces (
  nonce TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,
  return_to TEXT,
  redirect_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE public.oauth_nonces ENABLE ROW LEVEL SECURITY;

-- No policies — only service role (which bypasses RLS) accesses this table.
-- Default deny for all authenticated/anon users.

CREATE INDEX IF NOT EXISTS idx_oauth_nonces_expires ON public.oauth_nonces(expires_at);
