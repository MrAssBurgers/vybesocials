-- Create table for publicly shared themes
CREATE TABLE public.shared_themes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme_name TEXT NOT NULL,
  theme_tokens JSONB NOT NULL,
  description TEXT,
  likes_count INTEGER DEFAULT 0,
  downloads_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for saved/favorited themes
CREATE TABLE public.saved_themes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_theme_id UUID NOT NULL REFERENCES public.shared_themes(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, shared_theme_id)
);

-- Create table for theme likes
CREATE TABLE public.theme_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_theme_id UUID NOT NULL REFERENCES public.shared_themes(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, shared_theme_id)
);

-- Enable RLS
ALTER TABLE public.shared_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theme_likes ENABLE ROW LEVEL SECURITY;

-- Shared themes policies
CREATE POLICY "Anyone can view public shared themes"
  ON public.shared_themes FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can create shared themes"
  ON public.shared_themes FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update their own shared themes"
  ON public.shared_themes FOR UPDATE
  USING (auth.uid() = creator_id);

CREATE POLICY "Users can delete their own shared themes"
  ON public.shared_themes FOR DELETE
  USING (auth.uid() = creator_id);

-- Saved themes policies
CREATE POLICY "Users can view their saved themes"
  ON public.saved_themes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save themes"
  ON public.saved_themes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave themes"
  ON public.saved_themes FOR DELETE
  USING (auth.uid() = user_id);

-- Theme likes policies
CREATE POLICY "Anyone can view theme likes"
  ON public.theme_likes FOR SELECT
  USING (true);

CREATE POLICY "Users can like themes"
  ON public.theme_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike themes"
  ON public.theme_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update likes count
CREATE OR REPLACE FUNCTION public.update_theme_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.shared_themes SET likes_count = likes_count + 1 WHERE id = NEW.shared_theme_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.shared_themes SET likes_count = likes_count - 1 WHERE id = OLD.shared_theme_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_theme_likes_count_trigger
  AFTER INSERT OR DELETE ON public.theme_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_theme_likes_count();

-- Function to update downloads count
CREATE OR REPLACE FUNCTION public.increment_theme_downloads(theme_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.shared_themes SET downloads_count = downloads_count + 1 WHERE id = theme_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;