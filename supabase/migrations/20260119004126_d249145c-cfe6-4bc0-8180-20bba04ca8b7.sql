-- Create dismissed_profiles table for permanent profile hiding
CREATE TABLE public.dismissed_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dismissed_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, dismissed_user_id)
);

-- Enable RLS
ALTER TABLE public.dismissed_profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own dismissed profiles
CREATE POLICY "Users can view own dismissed profiles"
  ON public.dismissed_profiles FOR SELECT
  USING (user_id = public.current_profile_id());

-- Users can dismiss profiles
CREATE POLICY "Users can dismiss profiles"
  ON public.dismissed_profiles FOR INSERT
  WITH CHECK (user_id = public.current_profile_id());

-- Users can undismiss profiles
CREATE POLICY "Users can undismiss profiles"
  ON public.dismissed_profiles FOR DELETE
  USING (user_id = public.current_profile_id());

-- Add index for performance
CREATE INDEX idx_dismissed_profiles_user_id ON public.dismissed_profiles(user_id);
CREATE INDEX idx_dismissed_profiles_dismissed_user_id ON public.dismissed_profiles(dismissed_user_id);