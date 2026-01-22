-- Create function to claim unclaimed profile by email
CREATE OR REPLACE FUNCTION public.claim_profile_by_email()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _auth_user_id uuid;
  _user_email text;
  _unclaimed_profile_id uuid;
BEGIN
  _auth_user_id := auth.uid();
  
  IF _auth_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get user's email from auth.users
  SELECT email INTO _user_email FROM auth.users WHERE id = _auth_user_id;
  
  -- Check if user already has a profile
  SELECT id INTO _unclaimed_profile_id FROM public.profiles WHERE user_id = _auth_user_id LIMIT 1;
  IF _unclaimed_profile_id IS NOT NULL THEN
    RETURN _unclaimed_profile_id;
  END IF;
  
  -- Try to find and claim an unclaimed profile by email
  UPDATE public.profiles
  SET user_id = _auth_user_id
  WHERE user_id IS NULL AND email = _user_email
  RETURNING id INTO _unclaimed_profile_id;
  
  IF _unclaimed_profile_id IS NOT NULL THEN
    RETURN _unclaimed_profile_id;
  END IF;
  
  -- If no match, create new profile via ensure_profile
  RETURN public.ensure_profile();
END;
$$;