ALTER TABLE public.content_appeals 
  ADD COLUMN IF NOT EXISTS draft_caption text,
  ADD COLUMN IF NOT EXISTS draft_tags text[],
  ADD COLUMN IF NOT EXISTS draft_media_urls text[],
  ADD COLUMN IF NOT EXISTS content_category text,
  ADD COLUMN IF NOT EXISTS scan_reason text;