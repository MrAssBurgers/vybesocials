-- 1. Remove username-based privilege escalation policy
DROP POLICY IF EXISTS "Owner can manage meme ban backgrounds" ON public.meme_ban_backgrounds;

CREATE POLICY "Owner can manage meme ban backgrounds"
ON public.meme_ban_backgrounds
FOR ALL
TO authenticated
USING (public.is_owner(auth.uid()))
WITH CHECK (public.is_owner(auth.uid()));

-- 2. Make current_user_has_role authoritative against user_roles_auth (auth.uid keyed)
CREATE OR REPLACE FUNCTION public.current_user_has_role(_role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles_auth
    WHERE user_id = auth.uid()
      AND role = _role
  )
$function$;