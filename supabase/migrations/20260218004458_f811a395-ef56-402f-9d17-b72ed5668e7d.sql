
-- Add tracking consent and founder badge seen columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tracking_consent text DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS founder_badge_seen boolean DEFAULT false;
