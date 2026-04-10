-- Drop ALL overloads of add_user_xp first (required to change return type)
DROP FUNCTION IF EXISTS public.add_user_xp(uuid, integer);
DROP FUNCTION IF EXISTS public.add_user_xp(uuid, integer, text);

-- Recreate 2-arg version targeting user_levels, returning jsonb
CREATE OR REPLACE FUNCTION public.add_user_xp(p_user_id uuid, p_xp integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  INSERT INTO public.user_levels (user_id, total_xp, current_level)
  VALUES (p_user_id, p_xp, 1)
  ON CONFLICT (user_id)
  DO UPDATE SET total_xp = user_levels.total_xp + p_xp, updated_at = now();

  SELECT jsonb_build_object('success', true, 'xp_added', p_xp) INTO v_result;
  RETURN v_result;
END;
$$;

-- Add FK from user_locations to profiles (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_locations_user_id_fkey'
      AND table_name = 'user_locations'
  ) THEN
    ALTER TABLE public.user_locations
      ADD CONSTRAINT user_locations_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;