
-- Fix function search_path for link_profile_to_auth
CREATE OR REPLACE FUNCTION public.link_profile_to_auth()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
