-- Add custom_gif_url column for custom meme ban backgrounds
ALTER TABLE public.user_bans 
ADD COLUMN custom_gif_url TEXT;