-- Fix RLS policies for listings: use auth.uid() directly instead of current_profile_id()
-- The has_role function expects auth.uid() but current_profile_id() returns profiles.id

DROP POLICY IF EXISTS "Admins and mods can delete listings" ON public.listings;
CREATE POLICY "Admins and mods can delete listings"
  ON public.listings FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'moderator'::app_role)
  );

DROP POLICY IF EXISTS "Admins and mods can update listings" ON public.listings;
CREATE POLICY "Admins and mods can update listings"
  ON public.listings FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'moderator'::app_role)
  );

-- Add reason column to notifications for admin content removal reasons
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS reason text;
