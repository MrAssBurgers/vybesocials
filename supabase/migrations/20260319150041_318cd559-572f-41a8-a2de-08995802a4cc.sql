
-- Table to store content preferences learned from DNA chat conversations
CREATE TABLE public.dna_content_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  boost_topics TEXT[] DEFAULT '{}',
  reduce_topics TEXT[] DEFAULT '{}',
  preferred_content_types TEXT[] DEFAULT '{}',
  discovery_level TEXT DEFAULT 'balanced' CHECK (discovery_level IN ('conservative', 'balanced', 'adventurous')),
  creator_affinity_overrides JSONB DEFAULT '{}',
  conversation_context JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.dna_content_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own DNA preferences"
  ON public.dna_content_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own DNA preferences"
  ON public.dna_content_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own DNA preferences"
  ON public.dna_content_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add layout_settings columns to shared_themes for full theme sharing
-- (layout_settings column already exists as JSONB, we just need to ensure it stores everything)

-- Add trigger for updated_at
CREATE TRIGGER update_dna_content_preferences_updated_at
  BEFORE UPDATE ON public.dna_content_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
