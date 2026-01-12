-- Add first_name and last_name columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Create an index for name searches
CREATE INDEX IF NOT EXISTS idx_profiles_name_search 
ON public.profiles USING GIN (
  to_tsvector('english', COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') || ' ' || COALESCE(display_name, '') || ' ' || username)
);