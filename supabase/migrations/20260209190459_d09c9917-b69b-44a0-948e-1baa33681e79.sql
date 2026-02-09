
-- Fix RLS policies on user_bans to use auth.uid() instead of current_profile_id()
-- The has_role function checks user_roles_auth which is keyed by auth.uid(), not profile id

DROP POLICY IF EXISTS "Admins and mods can create bans" ON public.user_bans;
CREATE POLICY "Admins and mods can create bans"
ON public.user_bans FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)
);

DROP POLICY IF EXISTS "Admins and mods can view all bans" ON public.user_bans;
CREATE POLICY "Admins and mods can view all bans"
ON public.user_bans FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete bans" ON public.user_bans;
CREATE POLICY "Admins can delete bans"
ON public.user_bans FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Admins can update bans" ON public.user_bans;
CREATE POLICY "Admins can update bans"
ON public.user_bans FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Users can view own bans" ON public.user_bans;
CREATE POLICY "Users can view own bans"
ON public.user_bans FOR SELECT
TO authenticated
USING (user_id = current_profile_id());
