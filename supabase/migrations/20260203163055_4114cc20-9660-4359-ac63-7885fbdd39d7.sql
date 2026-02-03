-- Drop and recreate function with proper profile ID resolution
DROP FUNCTION IF EXISTS public.get_user_primary_badge(uuid);

CREATE FUNCTION public.get_user_primary_badge(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  icon text,
  category text,
  priority int,
  gradient_from text,
  gradient_to text,
  gradient_via text,
  effect text,
  is_animated boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_user_id uuid;
BEGIN
  -- First try to resolve p_user_id as a profile ID to get the auth user_id
  SELECT p.user_id INTO resolved_user_id
  FROM profiles p
  WHERE p.id = p_user_id;
  
  -- If no match found, assume p_user_id is already an auth user_id
  IF resolved_user_id IS NULL THEN
    resolved_user_id := p_user_id;
  END IF;
  
  -- Now fetch the primary badge using the resolved auth user_id
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.icon,
    b.category::text,
    b.priority,
    b.gradient_from,
    b.gradient_to,
    b.gradient_via,
    b.effect,
    b.is_animated
  FROM user_badges ub
  JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = resolved_user_id
    AND b.is_active = true
    AND (ub.expires_at IS NULL OR ub.expires_at > now())
  ORDER BY b.priority ASC
  LIMIT 1;
END;
$$;