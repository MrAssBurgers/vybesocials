-- Fix admin/mod listing policies to use profile-based roles (user_roles.user_id stores profiles.id)

DROP POLICY IF EXISTS "Admins and mods can delete listings" ON public.listings;
CREATE POLICY "Admins and mods can delete listings"
ON public.listings
FOR DELETE
TO authenticated
USING (
  public.has_role(public.current_profile_id(), 'admin'::public.app_role)
  OR public.has_role(public.current_profile_id(), 'moderator'::public.app_role)
);

DROP POLICY IF EXISTS "Admins and mods can update listings" ON public.listings;
CREATE POLICY "Admins and mods can update listings"
ON public.listings
FOR UPDATE
TO authenticated
USING (
  public.has_role(public.current_profile_id(), 'admin'::public.app_role)
  OR public.has_role(public.current_profile_id(), 'moderator'::public.app_role)
);