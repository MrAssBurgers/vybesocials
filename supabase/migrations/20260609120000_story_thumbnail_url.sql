-- Poster thumbnail for Snapchat-style story bar tiles
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

COMMENT ON COLUMN public.stories.thumbnail_url IS
  'Cover image for story bar poster; auto-generated on create or set manually';
