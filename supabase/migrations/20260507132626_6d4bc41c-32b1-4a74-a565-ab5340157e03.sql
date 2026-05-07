
DROP VIEW IF EXISTS public.public_profiles CASCADE;
DROP VIEW IF EXISTS public.public_business_profiles CASCADE;

-- =========================================================================
-- 1. PROFILES — keep authenticated read access (app needs it) but provide a
--    safe public view, and ensure anon cannot read.
-- =========================================================================
CREATE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT
  id, user_id, username, display_name, avatar_url, bio, link_url, location,
  is_private, is_verified, interests, language, timezone,
  created_at, updated_at,
  equipped_title, equipped_effect, equipped_frame, equipped_name_color,
  equipped_profile_theme, equipped_badge_id, badge_settings,
  is_premium, premium_expires_at, music_personality,
  login_streak, last_login_date, onboarding_completed
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated, anon;

-- =========================================================================
-- 2. BUSINESS PROFILES — strip sensitive fields from public reads
-- =========================================================================
DROP POLICY IF EXISTS "Anon users can view active business profiles" ON public.business_profiles;
DROP POLICY IF EXISTS "Authenticated users can view business profiles" ON public.business_profiles;

CREATE POLICY "Owners can view full business profile"
  ON public.business_profiles FOR SELECT
  TO authenticated
  USING (owner_id = public.current_profile_id());

CREATE VIEW public.public_business_profiles
WITH (security_invoker = true) AS
SELECT
  id, owner_id, name, slug, description, category, location,
  logo_url, banner_url, website, social_links, business_hours,
  rating_average, rating_count, view_count,
  is_active, is_verified, created_at, updated_at
FROM public.business_profiles
WHERE is_active = true;

GRANT SELECT ON public.public_business_profiles TO anon, authenticated;

-- =========================================================================
-- 3. NOTIFICATIONS — restrict INSERT to actor = caller
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;

CREATE POLICY "Users can create notifications as themselves"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id IS NULL
    OR actor_id = public.current_profile_id()
  );

-- =========================================================================
-- 4. AD CAMPAIGNS — require auth to view
-- =========================================================================
DROP POLICY IF EXISTS "Active ads visible to all" ON public.ad_campaigns;

CREATE POLICY "Active ads visible to authenticated users"
  ON public.ad_campaigns FOR SELECT
  TO authenticated
  USING (status = 'active'::ad_status);

-- =========================================================================
-- 5. FRIEND DROPS — require auth
-- =========================================================================
DROP POLICY IF EXISTS "Users can view drops" ON public.friend_drops;
DROP POLICY IF EXISTS "Users can create own drops" ON public.friend_drops;
DROP POLICY IF EXISTS "Users can update drops" ON public.friend_drops;
DROP POLICY IF EXISTS "Users can delete own drops" ON public.friend_drops;

CREATE POLICY "Auth users can view drops"
  ON public.friend_drops FOR SELECT
  TO authenticated
  USING (
    from_user_id = public.current_profile_id()
    OR to_user_id = public.current_profile_id()
    OR (status = 'pending' AND to_user_id IS NULL)
  );

CREATE POLICY "Auth users can create own drops"
  ON public.friend_drops FOR INSERT
  TO authenticated
  WITH CHECK (from_user_id = public.current_profile_id());

CREATE POLICY "Auth users can update drops"
  ON public.friend_drops FOR UPDATE
  TO authenticated
  USING (
    from_user_id = public.current_profile_id()
    OR to_user_id = public.current_profile_id()
    OR (status = 'pending' AND to_user_id IS NULL)
  )
  WITH CHECK (
    from_user_id = public.current_profile_id()
    OR to_user_id = public.current_profile_id()
    OR status = 'scanned'
  );

CREATE POLICY "Auth users can delete own drops"
  ON public.friend_drops FOR DELETE
  TO authenticated
  USING (from_user_id = public.current_profile_id());

-- =========================================================================
-- 6. ERROR LOGS — auth-only
-- =========================================================================
DROP POLICY IF EXISTS "Anyone can log errors" ON public.error_logs;

CREATE POLICY "Auth users can log own errors"
  ON public.error_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- =========================================================================
-- 7. STORAGE POLICIES
-- =========================================================================
DROP POLICY IF EXISTS "Users can delete their own chat media" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload chat media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view announcement media" ON storage.objects;

CREATE POLICY "Auth users view announcement media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'announcements');

UPDATE storage.buckets SET public = false WHERE id = 'announcements';

-- =========================================================================
-- 8. SECURITY DEFINER hardening
-- =========================================================================
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
