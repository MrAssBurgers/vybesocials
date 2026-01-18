-- Allow admins and moderators to delete any listing
DROP POLICY IF EXISTS "Admins and mods can delete listings" ON public.listings;

CREATE POLICY "Admins and mods can delete listings"
ON public.listings
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'moderator')
);

-- Allow admins and moderators to update any listing (e.g. mark as removed)
DROP POLICY IF EXISTS "Admins and mods can update listings" ON public.listings;

CREATE POLICY "Admins and mods can update listings"
ON public.listings
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'moderator')
);