
-- Fix get_user_primary_badge to always return the highest priority badge
-- The show_effect should only affect whether animations are shown, not whether the gradient is applied
CREATE OR REPLACE FUNCTION public.get_user_primary_badge(p_user_id uuid)
RETURNS TABLE(badge_id uuid, name text, icon text, gradient_from text, gradient_to text, gradient_via text, effect text, is_animated boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.icon,
    b.gradient_from,
    b.gradient_to,
    b.gradient_via,
    -- Only include effect if show_effect is true or it's a staff badge
    CASE WHEN ub.show_effect = true OR b.is_staff_badge = true THEN b.effect ELSE NULL END,
    -- Only animate if show_effect is true or it's a staff badge
    CASE WHEN ub.show_effect = true OR b.is_staff_badge = true THEN b.is_animated ELSE false END
  FROM public.user_badges ub
  JOIN public.badges b ON b.id = ub.badge_id
  WHERE ub.user_id = p_user_id
    AND b.is_active = true
    AND (ub.expires_at IS NULL OR ub.expires_at > now())
  ORDER BY b.priority ASC
  LIMIT 1;
END;
$function$;
