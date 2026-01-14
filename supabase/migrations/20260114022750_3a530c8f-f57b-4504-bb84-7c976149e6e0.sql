-- Create table for user custom themes
CREATE TABLE public.user_themes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  theme_name TEXT DEFAULT 'custom',
  theme_tokens JSONB NOT NULL DEFAULT '{}'::jsonb,
  base_preset TEXT DEFAULT 'classic',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_themes ENABLE ROW LEVEL SECURITY;

-- Users can only see their own themes
CREATE POLICY "Users can view their own themes"
ON public.user_themes
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own themes
CREATE POLICY "Users can create their own themes"
ON public.user_themes
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own themes
CREATE POLICY "Users can update their own themes"
ON public.user_themes
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own themes
CREATE POLICY "Users can delete their own themes"
ON public.user_themes
FOR DELETE
USING (auth.uid() = user_id);

-- Add index for fast lookups
CREATE INDEX idx_user_themes_user_id ON public.user_themes(user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_themes_updated_at
BEFORE UPDATE ON public.user_themes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();