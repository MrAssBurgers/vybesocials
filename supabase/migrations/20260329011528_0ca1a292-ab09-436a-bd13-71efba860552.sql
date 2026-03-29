
-- Fix missing add_user_xp function
CREATE OR REPLACE FUNCTION public.add_user_xp(
  p_user_id uuid,
  p_xp integer,
  p_source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET xp = COALESCE(xp, 0) + p_xp,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Fix missing music_personality column
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS music_personality text;
