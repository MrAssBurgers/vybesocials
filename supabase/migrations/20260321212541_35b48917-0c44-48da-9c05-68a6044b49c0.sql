-- Community AR filter gallery
CREATE TABLE public.community_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '✨',
  description TEXT,
  filter_config JSONB NOT NULL,
  category TEXT NOT NULL DEFAULT 'face',
  use_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_approved BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for browsing
CREATE INDEX idx_community_filters_popular ON public.community_filters(use_count DESC);
CREATE INDEX idx_community_filters_creator ON public.community_filters(creator_id);
CREATE INDEX idx_community_filters_category ON public.community_filters(category);

-- RLS
ALTER TABLE public.community_filters ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read approved filters
CREATE POLICY "Anyone can view approved filters"
  ON public.community_filters FOR SELECT
  TO authenticated
  USING (is_approved = true);

-- Creators can insert their own
CREATE POLICY "Users can create filters"
  ON public.community_filters FOR INSERT
  TO authenticated
  WITH CHECK (creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Creators can update their own
CREATE POLICY "Users can update own filters"
  ON public.community_filters FOR UPDATE
  TO authenticated
  USING (creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Creators can delete their own
CREATE POLICY "Users can delete own filters"
  ON public.community_filters FOR DELETE
  TO authenticated
  USING (creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Filter likes tracking
CREATE TABLE public.community_filter_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filter_id UUID NOT NULL REFERENCES public.community_filters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(filter_id, user_id)
);

ALTER TABLE public.community_filter_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view likes"
  ON public.community_filter_likes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can like filters"
  ON public.community_filter_likes FOR INSERT
  TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can unlike"
  ON public.community_filter_likes FOR DELETE
  TO authenticated
  USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));