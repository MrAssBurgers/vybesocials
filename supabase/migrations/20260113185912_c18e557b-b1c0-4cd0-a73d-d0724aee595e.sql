-- Add tutorial tracking fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS tutorial_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS tutorial_skipped boolean DEFAULT false;