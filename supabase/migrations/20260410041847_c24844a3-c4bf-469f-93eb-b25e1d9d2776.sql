-- Fix search_path on update_sound_usage for security hardening
CREATE OR REPLACE FUNCTION public.update_sound_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notification_sounds
  SET times_used = times_used + 1,
      last_used_at = now()
  WHERE id = NEW.notification_sound_id;
  RETURN NEW;
END;
$$;