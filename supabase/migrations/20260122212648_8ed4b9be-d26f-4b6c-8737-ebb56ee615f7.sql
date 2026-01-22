-- Phase 1: Make user_id nullable to allow importing profiles without auth accounts
ALTER TABLE public.profiles ALTER COLUMN user_id DROP NOT NULL;

-- Add email column for account claiming (matching when users sign up)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Add index for email lookups during account claiming
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email) WHERE email IS NOT NULL;

-- Add index for unclaimed profiles (user_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_profiles_unclaimed ON public.profiles(id) WHERE user_id IS NULL;