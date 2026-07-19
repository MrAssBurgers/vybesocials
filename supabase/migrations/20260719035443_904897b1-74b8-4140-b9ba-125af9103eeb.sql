-- Restrict authenticated SELECT on profiles to exclude PII columns.
-- Owners can still read their own PII via get_my_profile_private()/get_my_profile_sensitive().
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;

GRANT SELECT (
  id, user_id, username, avatar_url, bio, created_at, display_name, link_url, location,
  is_private, is_verified, phone_verified, interests, sensitivity_preference, language, timezone,
  coins_balance, onboarding_completed, first_name, last_name, tutorial_completed, tutorial_skipped,
  referral_inviter_id, intro_completed, badge_settings, age_verified, equipped_effect,
  equipped_frame, equipped_name_color, equipped_profile_theme, equipped_title, equipped_badge_id,
  founder_badge_seen, tracking_consent, is_premium, premium_expires_at, music_personality,
  last_login_date, login_streak, updated_at, crash_consent, cookie_consent, feature_on_landing,
  contact_discoverable, deletion_requested_at, scheduled_purge_at, date_of_birth
) ON public.profiles TO authenticated;

-- Keep full INSERT/UPDATE/DELETE handled by existing RLS + column-guard triggers.
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;