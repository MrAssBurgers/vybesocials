-- Drop the broken trigger and function
DROP TRIGGER IF EXISTS update_sound_usage_trigger ON public.posts;
DROP FUNCTION IF EXISTS public.update_sound_usage();

-- Recreate with correct table name
CREATE OR REPLACE FUNCTION public.update_sound_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sound_id IS NOT NULL THEN
    UPDATE public.sounds
    SET times_used = COALESCE(times_used, 0) + 1,
        last_used_at = now()
    WHERE id = NEW.sound_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_sound_usage_trigger
AFTER INSERT ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.update_sound_usage();