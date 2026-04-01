-- Remove the restrictive own-only SELECT (broad one already exists)
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- COLUMN-LEVEL SECURITY: Revoke SELECT on sensitive columns
REVOKE SELECT (
  email,
  phone_number,
  phone_verified,
  first_name,
  last_name,
  date_of_birth,
  age_verified,
  stripe_customer_id,
  coins_balance,
  tracking_consent,
  sensitivity_preference
) ON public.profiles FROM authenticated, anon;

-- Re-grant SELECT on all non-sensitive columns to authenticated
GRANT SELECT (
  id, user_id, username, display_name, avatar_url, bio, link_url,
  location, is_private, is_verified, interests, language, timezone,
  created_at, onboarding_completed, tutorial_completed,
  tutorial_skipped, intro_completed, badge_settings, referral_inviter_id,
  equipped_title, equipped_effect, equipped_frame, equipped_name_color,
  equipped_profile_theme, equipped_badge_id, founder_badge_seen,
  is_premium, premium_expires_at, music_personality
) ON public.profiles TO authenticated;