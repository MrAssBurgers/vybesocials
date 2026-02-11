-- Add media_urls column for carousel support
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS media_urls text[] DEFAULT NULL;

-- Make media_url nullable so text posts work
ALTER TABLE public.posts ALTER COLUMN media_url DROP NOT NULL;
ALTER TABLE public.posts ALTER COLUMN media_url SET DEFAULT NULL;