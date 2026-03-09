-- VYBE DNA: AI-generated visual signatures
CREATE TABLE public.vybe_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  signature_colors TEXT[] DEFAULT ARRAY['#8B5CF6', '#EC4899', '#06B6D4'],
  glyph_pattern TEXT DEFAULT 'wave',
  aura_intensity NUMERIC DEFAULT 0.7,
  personality_vector JSONB DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.vybe_dna ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view any DNA" ON public.vybe_dna FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage own DNA" ON public.vybe_dna FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- VYBE Tokens: Virtual currency system
CREATE TABLE public.vybe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  balance INTEGER DEFAULT 0,
  lifetime_earned INTEGER DEFAULT 0,
  lifetime_spent INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  description TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.vybe_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens" ON public.vybe_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own tokens" ON public.vybe_tokens FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own transactions" ON public.token_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON public.token_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Parallel Feeds: User feed preferences
CREATE TABLE public.parallel_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  feed_type TEXT NOT NULL DEFAULT 'custom',
  filters JSONB DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.parallel_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own feeds" ON public.parallel_feeds FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Mood tracking for Mood Morphing
CREATE TABLE public.mood_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  mood TEXT NOT NULL,
  intensity NUMERIC DEFAULT 0.5,
  source TEXT DEFAULT 'manual',
  detected_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.mood_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own moods" ON public.mood_states FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Live Widgets configuration
CREATE TABLE public.live_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  widget_type TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  position JSONB DEFAULT '{"x": 0, "y": 0}',
  size TEXT DEFAULT 'medium',
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.live_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own widgets" ON public.live_widgets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Token earning function
CREATE OR REPLACE FUNCTION public.earn_vybe_tokens(p_user_id UUID, p_amount INTEGER, p_type TEXT, p_description TEXT DEFAULT NULL, p_reference_id TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  INSERT INTO vybe_tokens (user_id, balance, lifetime_earned)
  VALUES (p_user_id, p_amount, p_amount)
  ON CONFLICT (user_id) DO UPDATE SET
    balance = vybe_tokens.balance + p_amount,
    lifetime_earned = vybe_tokens.lifetime_earned + p_amount,
    updated_at = now();
  
  INSERT INTO token_transactions (user_id, amount, transaction_type, description, reference_id)
  VALUES (p_user_id, p_amount, p_type, p_description, p_reference_id);
  
  SELECT balance INTO v_new_balance FROM vybe_tokens WHERE user_id = p_user_id;
  RETURN v_new_balance;
END;
$$;

-- Enable realtime for mood states
ALTER PUBLICATION supabase_realtime ADD TABLE public.mood_states;