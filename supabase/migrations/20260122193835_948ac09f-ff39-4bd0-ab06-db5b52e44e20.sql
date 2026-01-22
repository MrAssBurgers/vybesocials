-- Update get_profile_by_username to trim whitespace for robust matching
CREATE OR REPLACE FUNCTION public.get_profile_by_username(target_username text)
 RETURNS TABLE(id uuid, user_id uuid, username text, display_name text, avatar_url text, bio text, is_private boolean, is_verified boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.is_private,
    p.is_verified,
    p.created_at
  FROM public.profiles p
  WHERE LOWER(TRIM(p.username)) = LOWER(TRIM(target_username))
  LIMIT 1;
END;
$function$;