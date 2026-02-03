-- Add badge_settings column to profiles table
-- This allows users to control which badges are displayed on their profile
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS badge_settings jsonb DEFAULT '{"show_owner_badge": true, "show_mod_badge": true, "show_verified_badge": true}'::jsonb;