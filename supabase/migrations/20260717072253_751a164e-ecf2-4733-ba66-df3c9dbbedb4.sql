
-- =========================================================================
-- 1) my_profile_private: switch to security_invoker so it enforces the
--    caller's RLS on public.profiles, not the view creator's. This resolves
--    the "Security Definer View" linter finding.
-- =========================================================================
ALTER VIEW public.my_profile_private SET (security_invoker = true);

-- Ensure signed-in users can still read their own private row through it.
GRANT SELECT ON public.my_profile_private TO authenticated;

-- =========================================================================
-- 2) Profiles table: keep social/public columns broadly readable, but stop
--    exposing PII columns (email, phone_number, phone_e164_sha256,
--    date_of_birth, stripe_customer_id) to every other signed-in user.
--    Owners read their own PII via the my_profile_private view above.
--    Service role (edge functions / admin code) keeps full access.
-- =========================================================================

-- Reset broad table-level SELECT so we can grant per column.
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;

-- Service role: full access (bypasses RLS).
GRANT ALL ON public.profiles TO service_role;

-- Authenticated users: column-level SELECT on non-sensitive fields only.
GRANT SELECT (
  id, user_id, username, avatar_url, bio, created_at, display_name, link_url,
  location, is_private, is_verified, phone_verified, interests,
  sensitivity_preference, language, timezone, coins_balance,
  onboarding_completed, first_name, last_name, tutorial_completed,
  tutorial_skipped, referral_inviter_id, intro_completed, badge_settings,
  age_verified, equipped_effect, equipped_frame, equipped_name_color,
  equipped_profile_theme, equipped_title, equipped_badge_id,
  founder_badge_seen, tracking_consent, is_premium, premium_expires_at,
  music_personality, last_login_date, login_streak, updated_at,
  crash_consent, cookie_consent, feature_on_landing, contact_discoverable,
  deletion_requested_at, scheduled_purge_at
) ON public.profiles TO authenticated;

-- Keep INSERT / UPDATE / DELETE table-level (RLS policies already scope
-- these to auth.uid() = user_id).
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

-- =========================================================================
-- 3) user_warnings: prevent warned users from rewriting reason / warned_by
--    / created_at on their own warning record. They may only toggle the
--    acknowledgment fields. Moderators and admins keep full edit rights
--    via the existing admin/moderator policies.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.enforce_user_warning_ack_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip the check entirely for admins/moderators; they may edit any field.
  IF public.has_role(public.current_profile_id(), 'admin'::app_role)
     OR public.has_role(public.current_profile_id(), 'moderator'::app_role) THEN
    RETURN NEW;
  END IF;

  -- For the warned user acknowledging their own warning: only the
  -- `acknowledged` and `acknowledged_at` columns may change.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.warned_by IS DISTINCT FROM OLD.warned_by
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'You may only acknowledge your own warning; other fields are read-only.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_user_warning_ack_only_trg ON public.user_warnings;
CREATE TRIGGER enforce_user_warning_ack_only_trg
BEFORE UPDATE ON public.user_warnings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_user_warning_ack_only();
