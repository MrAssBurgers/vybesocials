
CREATE TYPE public.dna_agent_mode AS ENUM ('off', 'suggest', 'autonomous');

CREATE TABLE public.dna_agent_settings (
  user_id uuid PRIMARY KEY,
  mode public.dna_agent_mode NOT NULL DEFAULT 'suggest',
  cadence_minutes integer NOT NULL DEFAULT 360,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dna_agent_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings select" ON public.dna_agent_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own settings insert" ON public.dna_agent_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own settings update" ON public.dna_agent_settings FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.dna_auto_theme (
  user_id uuid PRIMARY KEY,
  signature_colors jsonb NOT NULL DEFAULT '[]'::jsonb,
  gradient text,
  glyph_pattern text,
  aura_intensity numeric DEFAULT 0.7,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dna_auto_theme ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own auto theme select" ON public.dna_auto_theme FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own auto theme insert" ON public.dna_auto_theme FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own auto theme update" ON public.dna_auto_theme FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own auto theme delete" ON public.dna_auto_theme FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.dna_agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('feed_tune','theme_swap','layout_change','suggest_user','nudge')),
  summary text NOT NULL,
  before jsonb,
  after jsonb,
  applied boolean NOT NULL DEFAULT true,
  reverted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dna_agent_actions_user_created ON public.dna_agent_actions (user_id, created_at DESC);
ALTER TABLE public.dna_agent_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own actions select" ON public.dna_agent_actions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own actions update" ON public.dna_agent_actions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_dna_agent_settings_updated_at
BEFORE UPDATE ON public.dna_agent_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
