-- =====================================================
-- Phase 1: Fix roles + badges backend (Fixed version)
-- =====================================================

-- 1. Create new auth-keyed roles table
CREATE TABLE IF NOT EXISTS public.user_roles_auth (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles_auth ENABLE ROW LEVEL SECURITY;

-- RLS: Everyone can read roles (needed for display)
CREATE POLICY "Anyone can view roles" ON public.user_roles_auth
  FOR SELECT USING (true);

-- RLS: Only admins can modify roles
CREATE POLICY "Admins can manage roles" ON public.user_roles_auth
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles_auth ura
      WHERE ura.user_id = auth.uid() AND ura.role = 'admin'
    )
  );

-- 2. Migrate existing roles from user_roles (profile-id keyed) to user_roles_auth (auth-id keyed)
INSERT INTO public.user_roles_auth (user_id, role, granted_at)
SELECT DISTINCT 
  COALESCE(p.user_id, ur.user_id) as user_id,
  ur.role,
  COALESCE(ur.created_at, now())
FROM public.user_roles ur
LEFT JOIN public.profiles p ON p.id = ur.user_id
WHERE COALESCE(p.user_id, ur.user_id) IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 3. Update has_role function to use the new table
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles_auth
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4. Create helper to get profile id from auth uid
CREATE OR REPLACE FUNCTION public.get_profile_id_for_auth(_auth_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.profiles WHERE user_id = _auth_id LIMIT 1
$$;

-- 5. Create helper to get auth id from profile id
CREATE OR REPLACE FUNCTION public.get_auth_id_for_profile(_profile_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT user_id FROM public.profiles WHERE id = _profile_id AND user_id IS NOT NULL),
    _profile_id -- fallback: assume it's already an auth id
  )
$$;

-- 6. Define constants for exclusive users
CREATE OR REPLACE FUNCTION public.get_owner_auth_id()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT user_id FROM public.profiles 
  WHERE LOWER(TRIM(username)) = 'mrassburgers' AND user_id IS NOT NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_owner_wife_auth_id()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT user_id FROM public.profiles 
  WHERE id = 'bb086232-ce0d-4562-937e-eb51eb3589ab'::uuid AND user_id IS NOT NULL
  LIMIT 1
$$;

-- 7. Completely rewrite award_badge to handle ID resolution + exclusivity
CREATE OR REPLACE FUNCTION public.award_badge(
  p_user_id UUID,
  p_badge_id UUID,
  p_awarded_by UUID DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_target_auth_id UUID;
  v_badge RECORD;
  v_caller_auth_id UUID;
  v_owner_auth_id UUID;
  v_wife_auth_id UUID;
  v_result_id UUID;
BEGIN
  v_caller_auth_id := auth.uid();
  
  -- Resolve target to auth user id
  v_target_auth_id := public.get_auth_id_for_profile(p_user_id);
  
  IF v_target_auth_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Get badge info
  SELECT * INTO v_badge FROM public.badges WHERE id = p_badge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Badge not found';
  END IF;
  
  -- Get exclusive user IDs
  v_owner_auth_id := public.get_owner_auth_id();
  v_wife_auth_id := public.get_owner_wife_auth_id();
  
  -- Enforce exclusivity for Owner badge
  IF v_badge.name = 'Owner' OR (v_badge.category = 'role' AND v_badge.priority = 1) THEN
    IF v_target_auth_id != v_owner_auth_id THEN
      RAISE EXCEPTION 'Owner badge is exclusive to the app owner';
    END IF;
  END IF;
  
  -- Enforce exclusivity for Owner's Wife badge
  IF v_badge.name = 'Owner''s Wife' THEN
    IF v_target_auth_id != v_wife_auth_id THEN
      RAISE EXCEPTION 'This badge is exclusive';
    END IF;
  END IF;
  
  -- Permission check: only admins/owner can award to others
  IF v_caller_auth_id IS NOT NULL AND v_caller_auth_id != v_target_auth_id THEN
    IF NOT (public.has_role(v_caller_auth_id, 'admin') OR v_caller_auth_id = v_owner_auth_id) THEN
      RAISE EXCEPTION 'Only admins can award badges to others';
    END IF;
  END IF;
  
  -- Insert the badge
  INSERT INTO public.user_badges (user_id, badge_id, awarded_by, expires_at)
  VALUES (v_target_auth_id, p_badge_id, p_awarded_by, p_expires_at)
  ON CONFLICT (user_id, badge_id) DO UPDATE SET
    expires_at = COALESCE(EXCLUDED.expires_at, user_badges.expires_at),
    awarded_by = COALESCE(EXCLUDED.awarded_by, user_badges.awarded_by)
  RETURNING id INTO v_result_id;
  
  RETURN v_result_id;
END;
$$;

-- 8. Update get_user_primary_badge to respect equipped badge + staff overrides
CREATE OR REPLACE FUNCTION public.get_user_primary_badge(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  icon TEXT,
  category TEXT,
  priority INTEGER,
  gradient_from TEXT,
  gradient_to TEXT,
  gradient_via TEXT,
  effect TEXT,
  is_animated BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth_id UUID;
  v_owner_auth_id UUID;
  v_wife_auth_id UUID;
BEGIN
  -- Resolve to auth user id
  v_auth_id := public.get_auth_id_for_profile(p_user_id);
  IF v_auth_id IS NULL THEN
    RETURN;
  END IF;
  
  v_owner_auth_id := public.get_owner_auth_id();
  v_wife_auth_id := public.get_owner_wife_auth_id();
  
  -- Priority 1: Owner always gets Owner badge styling
  IF v_auth_id = v_owner_auth_id THEN
    RETURN QUERY
    SELECT b.id, b.name, b.icon, b.category::TEXT, b.priority,
           b.gradient_from, b.gradient_to, b.gradient_via, b.effect, b.is_animated
    FROM public.badges b
    WHERE b.name = 'Owner' AND b.is_active = true
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;
  
  -- Priority 2: Owner's wife gets wife badge styling
  IF v_auth_id = v_wife_auth_id THEN
    RETURN QUERY
    SELECT b.id, b.name, b.icon, b.category::TEXT, b.priority,
           b.gradient_from, b.gradient_to, b.gradient_via, b.effect, b.is_animated
    FROM public.badges b
    WHERE b.name = 'Owner''s Wife' AND b.is_active = true
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;
  
  -- Priority 3: Staff roles (Admin, Moderator) - cannot be disabled
  IF public.has_role(v_auth_id, 'admin') THEN
    RETURN QUERY
    SELECT b.id, b.name, b.icon, b.category::TEXT, b.priority,
           b.gradient_from, b.gradient_to, b.gradient_via, b.effect, b.is_animated
    FROM public.badges b
    WHERE b.name = 'Admin' AND b.is_active = true
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;
  
  IF public.has_role(v_auth_id, 'moderator') THEN
    RETURN QUERY
    SELECT b.id, b.name, b.icon, b.category::TEXT, b.priority,
           b.gradient_from, b.gradient_to, b.gradient_via, b.effect, b.is_animated
    FROM public.badges b
    WHERE b.name = 'Moderator' AND b.is_active = true
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;
  
  -- Priority 4: User's equipped badge (is_primary = true)
  RETURN QUERY
  SELECT b.id, b.name, b.icon, b.category::TEXT, b.priority,
         b.gradient_from, b.gradient_to, b.gradient_via, b.effect, b.is_animated
  FROM public.user_badges ub
  JOIN public.badges b ON b.id = ub.badge_id
  WHERE ub.user_id = v_auth_id
    AND ub.is_primary = true
    AND b.is_active = true
    AND (ub.expires_at IS NULL OR ub.expires_at > now())
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;
  
  -- Priority 5: Fallback to highest priority earned badge
  RETURN QUERY
  SELECT b.id, b.name, b.icon, b.category::TEXT, b.priority,
         b.gradient_from, b.gradient_to, b.gradient_via, b.effect, b.is_animated
  FROM public.user_badges ub
  JOIN public.badges b ON b.id = ub.badge_id
  WHERE ub.user_id = v_auth_id
    AND b.is_active = true
    AND (ub.expires_at IS NULL OR ub.expires_at > now())
  ORDER BY b.priority ASC
  LIMIT 1;
END;
$$;

-- 9. Update badge colors for Admin, Moderator, Owner
UPDATE public.badges SET
  gradient_from = '0 100% 60%',
  gradient_to = '345 100% 45%',
  gradient_via = '15 100% 55%',
  effect = 'glow',
  is_animated = false,
  is_staff_badge = true,
  can_be_disabled = false
WHERE name = 'Admin';

UPDATE public.badges SET
  gradient_from = '220 10% 75%',
  gradient_to = '220 5% 45%',
  gradient_via = '220 15% 85%',
  effect = 'shine',
  is_animated = false,
  is_staff_badge = true,
  can_be_disabled = false
WHERE name = 'Moderator';

UPDATE public.badges SET
  gradient_from = '45 100% 60%',
  gradient_to = '35 100% 45%',
  gradient_via = '50 100% 70%',
  effect = 'shine',
  is_animated = false,
  is_staff_badge = true,
  can_be_disabled = false
WHERE name = 'Owner';

-- 10. Create Owner's Wife badge (insert or update by checking existence)
DO $$
DECLARE
  v_existing_id UUID;
BEGIN
  SELECT id INTO v_existing_id FROM public.badges WHERE name = 'Owner''s Wife';
  
  IF v_existing_id IS NULL THEN
    INSERT INTO public.badges (
      name, description, icon, category, priority,
      gradient_from, gradient_to, gradient_via, effect, is_animated,
      is_staff_badge, can_be_disabled, is_active
    ) VALUES (
      'Owner''s Wife',
      'The one and only',
      '💍',
      'role',
      3,
      '345 60% 35%',
      '330 70% 25%',
      '350 65% 45%',
      'shine',
      false,
      true,
      false,
      true
    );
  ELSE
    UPDATE public.badges SET
      gradient_from = '345 60% 35%',
      gradient_to = '330 70% 25%',
      gradient_via = '350 65% 45%',
      effect = 'shine',
      is_staff_badge = true,
      can_be_disabled = false
    WHERE id = v_existing_id;
  END IF;
END $$;

-- 11. Grant wife badge to the wife user
DO $$
DECLARE
  v_wife_auth_id UUID;
  v_wife_badge_id UUID;
BEGIN
  SELECT user_id INTO v_wife_auth_id 
  FROM public.profiles 
  WHERE id = 'bb086232-ce0d-4562-937e-eb51eb3589ab';
  
  SELECT id INTO v_wife_badge_id FROM public.badges WHERE name = 'Owner''s Wife';
  
  IF v_wife_auth_id IS NOT NULL AND v_wife_badge_id IS NOT NULL THEN
    INSERT INTO public.user_badges (user_id, badge_id, show_effect, is_primary)
    VALUES (v_wife_auth_id, v_wife_badge_id, true, true)
    ON CONFLICT (user_id, badge_id) DO UPDATE SET show_effect = true;
  END IF;
END $$;

-- 12. Sync owner roles to auth table
DO $$
DECLARE
  v_owner_auth_id UUID;
BEGIN
  v_owner_auth_id := public.get_owner_auth_id();
  IF v_owner_auth_id IS NOT NULL THEN
    INSERT INTO public.user_roles_auth (user_id, role)
    VALUES (v_owner_auth_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;