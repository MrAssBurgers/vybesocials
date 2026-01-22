-- Fix infinite recursion in RLS policies on public.profiles by removing policies
-- that call current_profile_id() (which queries profiles), causing policy recursion.

-- Drop recursive SELECT policies
DROP POLICY IF EXISTS "Users can view profiles of conversation members" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles of follows" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles of friends" ON public.profiles;

-- Add a secure helper for username availability checks without exposing profile rows.
-- This bypasses RLS safely by using SECURITY DEFINER (owner: postgres).
CREATE OR REPLACE FUNCTION public.is_username_available(p_username text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
BEGIN
  v_username := lower(btrim(coalesce(p_username, '')));

  IF v_username = '' THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE lower(p.username) = v_username
  );
END;
$$;