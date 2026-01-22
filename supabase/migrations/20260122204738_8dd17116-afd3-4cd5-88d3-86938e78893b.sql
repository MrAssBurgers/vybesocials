-- Add intro_completed column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS intro_completed BOOLEAN DEFAULT false;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_intro_completed ON public.profiles(intro_completed);