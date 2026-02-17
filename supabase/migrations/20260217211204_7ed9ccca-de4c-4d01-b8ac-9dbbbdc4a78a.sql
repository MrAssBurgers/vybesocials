
-- Add equipped_badge_id column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_badge_id UUID REFERENCES public.badges(id) ON DELETE SET NULL;

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_profiles_equipped_badge ON public.profiles(equipped_badge_id) WHERE equipped_badge_id IS NOT NULL;
