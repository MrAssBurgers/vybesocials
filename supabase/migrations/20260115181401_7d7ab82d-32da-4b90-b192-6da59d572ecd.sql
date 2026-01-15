-- Fix RLS for meme_ban_backgrounds: profiles.id != auth.uid(), roles use profile_id

DROP POLICY IF EXISTS "Owner can manage meme ban backgrounds" ON public.meme_ban_backgrounds;
DROP POLICY IF EXISTS "Mods and admins can manage meme ban backgrounds" ON public.meme_ban_backgrounds;

-- Owner can manage (match by profiles.user_id -> auth uid)
CREATE POLICY "Owner can manage meme ban backgrounds"
ON public.meme_ban_backgrounds
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND lower(p.username) = 'mrassburgers'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND lower(p.username) = 'mrassburgers'
  )
);

-- Admin/mod roles can manage (user_roles keyed by profile_id)
CREATE POLICY "Mods and admins can manage meme ban backgrounds"
ON public.meme_ban_backgrounds
FOR ALL
TO authenticated
USING (
  public.has_role(public.current_profile_id(), 'admin'::app_role)
  OR public.has_role(public.current_profile_id(), 'moderator'::app_role)
  OR public.has_role(public.current_profile_id(), 'owner_wife'::app_role)
)
WITH CHECK (
  public.has_role(public.current_profile_id(), 'admin'::app_role)
  OR public.has_role(public.current_profile_id(), 'moderator'::app_role)
  OR public.has_role(public.current_profile_id(), 'owner_wife'::app_role)
);
