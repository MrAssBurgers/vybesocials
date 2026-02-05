
-- Drop the foreign key constraint that's blocking us
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

-- Create a trigger to automatically populate user_id on insert for new profiles
CREATE OR REPLACE FUNCTION public.link_profile_to_auth()
RETURNS TRIGGER AS $$
BEGIN
  -- For new profiles, set user_id to the profile id (which should match auth user)
  IF NEW.user_id IS NULL THEN
    NEW.user_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS link_profile_to_auth_trigger ON profiles;
CREATE TRIGGER link_profile_to_auth_trigger
BEFORE INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION link_profile_to_auth();

-- Now we can safely update existing NULL user_ids
UPDATE profiles
SET user_id = id
WHERE user_id IS NULL;
