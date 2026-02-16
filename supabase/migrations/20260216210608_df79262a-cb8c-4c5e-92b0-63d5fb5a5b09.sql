
-- Tips table for creator tipping
CREATE TABLE public.tips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipper_id UUID NOT NULL,
  creator_id UUID NOT NULL REFERENCES public.creator_profiles(id),
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  message TEXT,
  stripe_payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  platform_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  creator_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;

-- Tippers can view their own tips
CREATE POLICY "Users can view their own tips"
  ON public.tips FOR SELECT
  USING (auth.uid() = tipper_id);

-- Creators can view tips they received (resolve via creator_profiles)
CREATE POLICY "Creators can view received tips"
  ON public.tips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.creator_profiles cp
      WHERE cp.id = tips.creator_id AND cp.user_id = auth.uid()
    )
  );

-- System inserts tips (via edge function with service role)
CREATE POLICY "Service role can insert tips"
  ON public.tips FOR INSERT
  WITH CHECK (true);

-- Index for performance
CREATE INDEX idx_tips_tipper ON public.tips(tipper_id);
CREATE INDEX idx_tips_creator ON public.tips(creator_id);
CREATE INDEX idx_tips_status ON public.tips(status);
