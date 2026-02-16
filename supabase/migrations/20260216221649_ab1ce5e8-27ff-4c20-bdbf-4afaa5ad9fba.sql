
-- Create growth_config table for founder program and other growth settings
CREATE TABLE IF NOT EXISTS public.growth_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.growth_config ENABLE ROW LEVEL SECURITY;

-- Public read access (growth config is non-sensitive)
CREATE POLICY "Anyone can read growth_config"
  ON public.growth_config FOR SELECT
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage growth_config"
  ON public.growth_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'owner'))
  );

-- Seed the founding program config
INSERT INTO public.growth_config (key, value) VALUES (
  'founding_program',
  jsonb_build_object(
    'badge_id', (SELECT id FROM badges WHERE name ILIKE '%founder%' LIMIT 1),
    'max_slots', 1000,
    'is_active', true
  )
) ON CONFLICT (key) DO NOTHING;
