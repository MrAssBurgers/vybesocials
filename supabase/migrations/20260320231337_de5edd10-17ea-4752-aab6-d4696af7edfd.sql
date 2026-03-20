
-- Table to store user's own AI provider API keys
CREATE TABLE public.user_ai_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'openai', 'google', 'anthropic', 'perplexity'
  api_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

ALTER TABLE public.user_ai_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own keys"
  ON public.user_ai_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own keys"
  ON public.user_ai_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own keys"
  ON public.user_ai_keys FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own keys"
  ON public.user_ai_keys FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_ai_keys_updated_at
  BEFORE UPDATE ON public.user_ai_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
