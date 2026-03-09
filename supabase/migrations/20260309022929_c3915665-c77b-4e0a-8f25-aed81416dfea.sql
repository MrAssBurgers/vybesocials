
-- Drop and recreate the conflicting policy
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.token_transactions;
CREATE POLICY "Users can insert own transactions" ON public.token_transactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Ensure remaining tables/policies exist (idempotent)
CREATE TABLE IF NOT EXISTS public.vybe_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signature_colors TEXT[] NOT NULL DEFAULT '{}',
  glyph_pattern TEXT NOT NULL DEFAULT 'default',
  aura_intensity REAL NOT NULL DEFAULT 0.5,
  traits JSONB DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.vybe_dna ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read any DNA" ON public.vybe_dna;
CREATE POLICY "Users can read any DNA" ON public.vybe_dna
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can upsert own DNA" ON public.vybe_dna;
CREATE POLICY "Users can upsert own DNA" ON public.vybe_dna
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own DNA" ON public.vybe_dna;
CREATE POLICY "Users can update own DNA" ON public.vybe_dna
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Marketplace purchases
CREATE TABLE IF NOT EXISTS public.marketplace_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  cost INTEGER NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.marketplace_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own purchases" ON public.marketplace_purchases;
CREATE POLICY "Users can read own purchases" ON public.marketplace_purchases
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own purchases" ON public.marketplace_purchases;
CREATE POLICY "Users can insert own purchases" ON public.marketplace_purchases
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Atomic purchase function
CREATE OR REPLACE FUNCTION public.purchase_marketplace_item(
  p_item_id TEXT,
  p_cost INTEGER,
  p_description TEXT DEFAULT 'Marketplace purchase'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT balance INTO v_balance FROM vybe_tokens WHERE user_id = v_user_id FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No token account');
  END IF;

  IF v_balance < p_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient tokens', 'balance', v_balance);
  END IF;

  UPDATE vybe_tokens
  SET balance = balance - p_cost, lifetime_spent = lifetime_spent + p_cost, updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO token_transactions (user_id, amount, transaction_type, description, reference_id)
  VALUES (v_user_id, -p_cost, 'purchase', p_description, p_item_id);

  INSERT INTO marketplace_purchases (user_id, item_id, cost)
  VALUES (v_user_id, p_item_id, p_cost);

  RETURN jsonb_build_object('success', true, 'new_balance', v_balance - p_cost);
END;
$$;

-- Auto-create token row on signup
CREATE OR REPLACE FUNCTION public.create_token_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.vybe_tokens (user_id, balance) VALUES (NEW.id, 100)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created_tokens') THEN
    CREATE TRIGGER on_auth_user_created_tokens
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.create_token_account();
  END IF;
END;
$$;
