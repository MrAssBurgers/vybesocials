
-- Table to store user public encryption keys for E2EE
CREATE TABLE public.encryption_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_key jsonb NOT NULL,
  key_algorithm text NOT NULL DEFAULT 'ECDH-P256',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.encryption_keys ENABLE ROW LEVEL SECURITY;

-- Users can read anyone's public key (needed for encryption)
CREATE POLICY "Anyone can read public keys"
  ON public.encryption_keys FOR SELECT
  TO authenticated
  USING (true);

-- Users can insert their own key
CREATE POLICY "Users can insert own key"
  ON public.encryption_keys FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own key
CREATE POLICY "Users can update own key"
  ON public.encryption_keys FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
