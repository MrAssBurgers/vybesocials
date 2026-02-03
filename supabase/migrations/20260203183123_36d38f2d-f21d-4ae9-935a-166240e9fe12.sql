
-- Update sync functions to handle the ID translation between auth.users and profiles

-- Badge granted → create role (user_badges uses auth.users.id, user_roles uses profiles.id)
CREATE OR REPLACE FUNCTION public.sync_badge_to_role()
RETURNS TRIGGER AS $$
DECLARE
  badge_name TEXT;
  role_to_grant app_role;
  profile_id_for_role UUID;
BEGIN
  -- Get badge name
  SELECT name INTO badge_name FROM badges WHERE id = NEW.badge_id;
  
  -- Map badge to role
  IF badge_name = 'Owner' OR badge_name = 'Admin' THEN
    role_to_grant := 'admin';
  ELSIF badge_name = 'Moderator' THEN
    role_to_grant := 'moderator';
  ELSE
    RETURN NEW; -- Not a role badge, skip
  END IF;
  
  -- Get profile ID from auth user ID (user_badges.user_id is auth ID)
  SELECT id INTO profile_id_for_role FROM profiles WHERE user_id = NEW.user_id;
  
  IF profile_id_for_role IS NOT NULL THEN
    -- Insert role using profile ID (user_roles.user_id references profiles.id)
    INSERT INTO user_roles (user_id, role)
    VALUES (profile_id_for_role, role_to_grant)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Badge removed → remove role
CREATE OR REPLACE FUNCTION public.sync_badge_removal_to_role()
RETURNS TRIGGER AS $$
DECLARE
  badge_name TEXT;
  role_to_remove app_role;
  profile_id_for_role UUID;
BEGIN
  -- Get badge name
  SELECT name INTO badge_name FROM badges WHERE id = OLD.badge_id;
  
  -- Map badge to role
  IF badge_name = 'Owner' OR badge_name = 'Admin' THEN
    role_to_remove := 'admin';
  ELSIF badge_name = 'Moderator' THEN
    role_to_remove := 'moderator';
  ELSE
    RETURN OLD; -- Not a role badge, skip
  END IF;
  
  -- Get profile ID from auth user ID
  SELECT id INTO profile_id_for_role FROM profiles WHERE user_id = OLD.user_id;
  
  IF profile_id_for_role IS NOT NULL THEN
    DELETE FROM user_roles WHERE user_id = profile_id_for_role AND role = role_to_remove;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Role granted → create badge (user_roles uses profiles.id, user_badges uses auth.users.id)
CREATE OR REPLACE FUNCTION public.sync_role_to_badge()
RETURNS TRIGGER AS $$
DECLARE
  badge_id_to_grant UUID;
  auth_user_id_for_badge UUID;
BEGIN
  -- Map role to badge
  IF NEW.role = 'admin' THEN
    SELECT id INTO badge_id_to_grant FROM badges WHERE name = 'Admin' LIMIT 1;
  ELSIF NEW.role = 'moderator' THEN
    SELECT id INTO badge_id_to_grant FROM badges WHERE name = 'Moderator' LIMIT 1;
  ELSE
    RETURN NEW; -- No badge for this role
  END IF;
  
  -- Get auth user ID from profile ID (user_roles.user_id is profiles.id)
  SELECT user_id INTO auth_user_id_for_badge FROM profiles WHERE id = NEW.user_id;
  
  IF badge_id_to_grant IS NOT NULL AND auth_user_id_for_badge IS NOT NULL THEN
    INSERT INTO user_badges (user_id, badge_id, is_primary, show_effect)
    VALUES (auth_user_id_for_badge, badge_id_to_grant, false, true)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Role removed → remove badge
CREATE OR REPLACE FUNCTION public.sync_role_removal_to_badge()
RETURNS TRIGGER AS $$
DECLARE
  badge_id_to_remove UUID;
  auth_user_id_for_badge UUID;
BEGIN
  -- Map role to badge
  IF OLD.role = 'admin' THEN
    SELECT id INTO badge_id_to_remove FROM badges WHERE name = 'Admin' LIMIT 1;
  ELSIF OLD.role = 'moderator' THEN
    SELECT id INTO badge_id_to_remove FROM badges WHERE name = 'Moderator' LIMIT 1;
  ELSE
    RETURN OLD;
  END IF;
  
  -- Get auth user ID from profile ID
  SELECT user_id INTO auth_user_id_for_badge FROM profiles WHERE id = OLD.user_id;
  
  IF badge_id_to_remove IS NOT NULL AND auth_user_id_for_badge IS NOT NULL THEN
    DELETE FROM user_badges WHERE user_id = auth_user_id_for_badge AND badge_id = badge_id_to_remove;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
