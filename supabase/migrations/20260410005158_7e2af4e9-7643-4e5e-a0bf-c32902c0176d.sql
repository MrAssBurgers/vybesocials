
-- Fix: add FK from user_locations.user_id to profiles.id
ALTER TABLE public.user_locations
  ADD CONSTRAINT user_locations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Fix: rewrite add_user_xp to use user_levels table
CREATE OR REPLACE FUNCTION public.add_user_xp(p_user_id uuid, p_xp integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_levels (user_id, total_xp, current_level)
  VALUES (p_user_id, p_xp, 1)
  ON CONFLICT (user_id)
  DO UPDATE SET
    total_xp = user_levels.total_xp + p_xp,
    updated_at = now();
END;
$$;
