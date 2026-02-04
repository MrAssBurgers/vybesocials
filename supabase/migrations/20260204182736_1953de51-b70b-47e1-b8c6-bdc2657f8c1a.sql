-- Add date_of_birth for age verification and viewed_at for vybe status tracking

-- Add date_of_birth to profiles for age-based content restrictions
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Add age_verified flag
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age_verified BOOLEAN DEFAULT false;

-- Add viewed_at to messages for tracking when vybes are opened
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;