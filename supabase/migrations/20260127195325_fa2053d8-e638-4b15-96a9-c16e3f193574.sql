-- User UI Settings table for full customization
CREATE TABLE IF NOT EXISTS public.user_ui_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  
  -- Theme settings
  theme_settings JSONB DEFAULT '{}'::jsonb,
  
  -- Layout module ordering (per page)
  layout_settings JSONB DEFAULT '{}'::jsonb,
  
  -- Navigation customization
  nav_settings JSONB DEFAULT '{
    "tabs": ["home", "explore", "upload", "messages", "profile"],
    "order": [0, 1, 2, 3, 4]
  }'::jsonb,
  
  -- Full JSON config for all UI preferences
  ui_config JSONB DEFAULT '{}'::jsonb,
  
  -- Safe mode flag (auto-repair broken layouts)
  safe_mode BOOLEAN DEFAULT false,
  
  -- Version for config migration
  config_version INTEGER DEFAULT 1,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_ui_settings ENABLE ROW LEVEL SECURITY;

-- User can only see/edit their own settings
CREATE POLICY "Users can view own UI settings"
  ON public.user_ui_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own UI settings"
  ON public.user_ui_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own UI settings"
  ON public.user_ui_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own UI settings"
  ON public.user_ui_settings FOR DELETE
  USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_user_ui_settings_updated_at
  BEFORE UPDATE ON public.user_ui_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Theme marketplace enhancements - add tags and categories
ALTER TABLE public.shared_themes 
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS preview_images TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS layout_settings JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS theme_code TEXT DEFAULT NULL;

-- Create index for category filtering
CREATE INDEX IF NOT EXISTS idx_shared_themes_category ON public.shared_themes(category);
CREATE INDEX IF NOT EXISTS idx_shared_themes_tags ON public.shared_themes USING GIN(tags);

-- Theme codes table for import/export
CREATE TABLE IF NOT EXISTS public.theme_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  theme_id UUID REFERENCES public.shared_themes(id) ON DELETE CASCADE NOT NULL,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  uses_count INTEGER DEFAULT 0,
  max_uses INTEGER DEFAULT NULL, -- NULL = unlimited
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on theme codes
ALTER TABLE public.theme_codes ENABLE ROW LEVEL SECURITY;

-- Anyone can view theme codes (needed for import)
CREATE POLICY "Anyone can view theme codes"
  ON public.theme_codes FOR SELECT
  USING (true);

-- Only creator can insert/delete
CREATE POLICY "Creators can insert theme codes"
  ON public.theme_codes FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = creator_id));

CREATE POLICY "Creators can delete theme codes"
  ON public.theme_codes FOR DELETE
  USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = creator_id));

-- Function to generate short theme codes
CREATE OR REPLACE FUNCTION public.generate_theme_code()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8))
$$;

-- Function to increment theme code uses
CREATE OR REPLACE FUNCTION public.use_theme_code(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_theme_id UUID;
BEGIN
  SELECT tc.theme_id INTO v_theme_id
  FROM public.theme_codes tc
  WHERE tc.code = upper(p_code)
    AND (tc.max_uses IS NULL OR tc.uses_count < tc.max_uses)
    AND (tc.expires_at IS NULL OR tc.expires_at > now());
  
  IF v_theme_id IS NOT NULL THEN
    UPDATE public.theme_codes
    SET uses_count = uses_count + 1
    WHERE code = upper(p_code);
  END IF;
  
  RETURN v_theme_id;
END;
$$;