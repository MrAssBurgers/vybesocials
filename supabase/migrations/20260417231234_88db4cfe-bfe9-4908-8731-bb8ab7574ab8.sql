-- Optimize RLS on user_backgrounds: evaluate current_profile_id() once per query
-- instead of per row. This fixes statement timeouts on /rest/v1/user_backgrounds.

DROP POLICY IF EXISTS "Users can view their own backgrounds" ON public.user_backgrounds;
DROP POLICY IF EXISTS "Users can update their own backgrounds" ON public.user_backgrounds;
DROP POLICY IF EXISTS "Users can delete their own backgrounds" ON public.user_backgrounds;
DROP POLICY IF EXISTS "Users can insert their own backgrounds" ON public.user_backgrounds;

CREATE POLICY "Users can view their own backgrounds"
ON public.user_backgrounds FOR SELECT
TO authenticated
USING (user_id = (SELECT public.current_profile_id()));

CREATE POLICY "Users can insert their own backgrounds"
ON public.user_backgrounds FOR INSERT
TO authenticated
WITH CHECK (user_id = (SELECT public.current_profile_id()));

CREATE POLICY "Users can update their own backgrounds"
ON public.user_backgrounds FOR UPDATE
TO authenticated
USING (user_id = (SELECT public.current_profile_id()))
WITH CHECK (user_id = (SELECT public.current_profile_id()));

CREATE POLICY "Users can delete their own backgrounds"
ON public.user_backgrounds FOR DELETE
TO authenticated
USING (user_id = (SELECT public.current_profile_id()));

-- Ensure profiles.user_id lookup (used inside current_profile_id) is indexed
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);