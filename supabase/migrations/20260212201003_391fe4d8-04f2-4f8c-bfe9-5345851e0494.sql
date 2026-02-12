
-- Add equipped cosmetic columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_title text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_effect text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_frame text;
