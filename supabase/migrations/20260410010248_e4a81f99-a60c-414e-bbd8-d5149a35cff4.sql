-- Drop old function first to allow return type change
DROP FUNCTION IF EXISTS public.add_user_xp(uuid, integer);

-- Recreate with correct logic targeting user_levels table
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

-- Add FK from user_locations to profiles if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_locations_user_id_fkey'
      AND table_name = 'user_locations'
  ) THEN
    ALTER TABLE public.user_locations
      ADD CONSTRAINT user_locations_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END;
$$;