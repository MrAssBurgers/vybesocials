-- Restore full SELECT grant on profiles table for authenticated users
-- The previous column-level revoke broke RLS evaluation entirely
-- RLS policies already handle access control - we don't need column-level restrictions
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- Ensure INSERT/UPDATE grants are intact
GRANT INSERT ON public.profiles TO authenticated;
GRANT UPDATE ON public.profiles TO authenticated;