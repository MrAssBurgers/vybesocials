
-- Filter marketplace tables

-- Community-created filters
CREATE TABLE public.filters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  css_filter TEXT NOT NULL DEFAULT '',
  overlay_url TEXT,
  effect_config JSONB DEFAULT '{}',
  category TEXT NOT NULL DEFAULT 'community',
  usage_count INTEGER NOT NULL DEFAULT 0,
  save_count INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  rejection_reason TEXT,
  trending_score NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.filters ENABLE ROW LEVEL SECURITY;

-- Anyone can view published & approved filters
CREATE POLICY "Anyone can view published filters"
  ON public.filters FOR SELECT
  USING (is_published = true AND is_approved = true);

-- Creators can view their own filters (incl. unpublished)
CREATE POLICY "Creators can view own filters"
  ON public.filters FOR SELECT
  TO authenticated
  USING (creator_id = auth.uid());

-- Creators can create filters
CREATE POLICY "Users can create filters"
  ON public.filters FOR INSERT
  TO authenticated
  WITH CHECK (creator_id = auth.uid());

-- Creators can update their own filters
CREATE POLICY "Users can update own filters"
  ON public.filters FOR UPDATE
  TO authenticated
  USING (creator_id = auth.uid());

-- Creators can delete their own filters
CREATE POLICY "Users can delete own filters"
  ON public.filters FOR DELETE
  TO authenticated
  USING (creator_id = auth.uid());

-- Filter usage tracking
CREATE TABLE public.filter_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  filter_id UUID NOT NULL REFERENCES public.filters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.filter_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view filter usage"
  ON public.filter_usage FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can log usage"
  ON public.filter_usage FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Saved filters
CREATE TABLE public.filter_saves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  filter_id UUID NOT NULL REFERENCES public.filters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(filter_id, user_id)
);

ALTER TABLE public.filter_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saves"
  ON public.filter_saves FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can save filters"
  ON public.filter_saves FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unsave filters"
  ON public.filter_saves FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Add filter_id to posts for viral tracking
ALTER TABLE public.posts ADD COLUMN filter_id UUID REFERENCES public.filters(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX idx_filters_trending ON public.filters (trending_score DESC) WHERE is_published = true AND is_approved = true;
CREATE INDEX idx_filters_creator ON public.filters (creator_id);
CREATE INDEX idx_filters_created ON public.filters (created_at DESC) WHERE is_published = true AND is_approved = true;
CREATE INDEX idx_filter_usage_filter ON public.filter_usage (filter_id);
CREATE INDEX idx_filter_usage_post ON public.filter_usage (post_id) WHERE post_id IS NOT NULL;
CREATE INDEX idx_posts_filter ON public.posts (filter_id) WHERE filter_id IS NOT NULL;

-- Function to increment filter usage count
CREATE OR REPLACE FUNCTION public.increment_filter_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.filters SET usage_count = usage_count + 1 WHERE id = NEW.filter_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_filter_usage_insert
  AFTER INSERT ON public.filter_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_filter_usage();

-- Function to update filter save count
CREATE OR REPLACE FUNCTION public.update_filter_save_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.filters SET save_count = save_count + 1 WHERE id = NEW.filter_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.filters SET save_count = save_count - 1 WHERE id = OLD.filter_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_filter_save_change
  AFTER INSERT OR DELETE ON public.filter_saves
  FOR EACH ROW
  EXECUTE FUNCTION public.update_filter_save_count();

-- Updated_at trigger for filters
CREATE TRIGGER update_filters_updated_at
  BEFORE UPDATE ON public.filters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
