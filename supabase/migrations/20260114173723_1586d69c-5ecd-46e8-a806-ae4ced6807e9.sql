-- Add meme ban support and warning acknowledgement
ALTER TABLE public.user_bans ADD COLUMN IF NOT EXISTS is_meme_ban boolean DEFAULT false;

ALTER TABLE public.user_warnings ADD COLUMN IF NOT EXISTS acknowledged boolean DEFAULT false;
ALTER TABLE public.user_warnings ADD COLUMN IF NOT EXISTS acknowledged_at timestamp with time zone;