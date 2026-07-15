
-- ============================================================
-- Shared helper: is_privileged_writer (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_privileged_writer()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r text := current_setting('role', true);
BEGIN
  IF r IN ('service_role','supabase_admin','postgres') THEN RETURN true; END IF;
  IF auth.uid() IS NULL THEN RETURN true; END IF;
  BEGIN
    IF public.has_role(auth.uid(), 'admin'::app_role) THEN RETURN true; END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  RETURN false;
END;
$$;

-- ============================================================
-- 1) profiles: hide PII columns from other users
-- ============================================================
REVOKE SELECT (phone_number, email, date_of_birth, phone_e164_sha256, stripe_customer_id)
  ON public.profiles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_profile_private()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  phone_number text,
  email text,
  date_of_birth date,
  phone_e164_sha256 text,
  stripe_customer_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.user_id, p.phone_number, p.email, p.date_of_birth,
         p.phone_e164_sha256, p.stripe_customer_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile_private() TO authenticated;

-- ============================================================
-- 2) user_locations: restrict shared-location visibility to friends
-- ============================================================
CREATE OR REPLACE FUNCTION public.are_profiles_friends(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friend_requests
    WHERE status = 'accepted'
      AND ((sender_id = _a AND receiver_id = _b)
        OR (sender_id = _b AND receiver_id = _a))
  );
$$;

GRANT EXECUTE ON FUNCTION public.are_profiles_friends(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Anyone authenticated can view shared locations" ON public.user_locations;

CREATE POLICY "Friends can view shared locations"
ON public.user_locations
FOR SELECT
TO authenticated
USING (
  sharing_enabled = true
  AND public.are_profiles_friends(
        user_id,
        (SELECT id FROM public.profiles WHERE profiles.user_id = auth.uid())
      )
);

-- ============================================================
-- 3) creator_profiles: block self-writes to privileged financial fields
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_creator_profiles_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() THEN RETURN NEW; END IF;
  IF NEW.is_approved              IS DISTINCT FROM OLD.is_approved              THEN RAISE EXCEPTION 'Not allowed: is_approved is admin-only'; END IF;
  IF NEW.tier                     IS DISTINCT FROM OLD.tier                     THEN RAISE EXCEPTION 'Not allowed: tier is admin-only'; END IF;
  IF NEW.total_earnings           IS DISTINCT FROM OLD.total_earnings           THEN RAISE EXCEPTION 'Not allowed: total_earnings is admin-only'; END IF;
  IF NEW.pending_payout           IS DISTINCT FROM OLD.pending_payout           THEN RAISE EXCEPTION 'Not allowed: pending_payout is admin-only'; END IF;
  IF NEW.subscriber_count         IS DISTINCT FROM OLD.subscriber_count         THEN RAISE EXCEPTION 'Not allowed: subscriber_count is admin-only'; END IF;
  IF NEW.stripe_connect_account_id IS DISTINCT FROM OLD.stripe_connect_account_id THEN RAISE EXCEPTION 'Not allowed: stripe_connect_account_id is admin-only'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_creator_profiles_privileged_columns ON public.creator_profiles;
CREATE TRIGGER trg_guard_creator_profiles_privileged_columns
BEFORE UPDATE ON public.creator_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_creator_profiles_privileged_columns();

-- ============================================================
-- 4) business_profiles: block self-writes to verification/revenue/rating fields
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_business_profiles_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() THEN RETURN NEW; END IF;
  IF NEW.is_verified                IS DISTINCT FROM OLD.is_verified                THEN RAISE EXCEPTION 'Not allowed: is_verified is admin-only'; END IF;
  IF NEW.stripe_onboarding_complete IS DISTINCT FROM OLD.stripe_onboarding_complete THEN RAISE EXCEPTION 'Not allowed: stripe_onboarding_complete is server-only'; END IF;
  IF NEW.stripe_account_id          IS DISTINCT FROM OLD.stripe_account_id          THEN RAISE EXCEPTION 'Not allowed: stripe_account_id is server-only'; END IF;
  IF NEW.total_revenue              IS DISTINCT FROM OLD.total_revenue              THEN RAISE EXCEPTION 'Not allowed: total_revenue is server-only'; END IF;
  IF NEW.total_sales                IS DISTINCT FROM OLD.total_sales                THEN RAISE EXCEPTION 'Not allowed: total_sales is server-only'; END IF;
  IF NEW.rating_average             IS DISTINCT FROM OLD.rating_average             THEN RAISE EXCEPTION 'Not allowed: rating_average is server-only'; END IF;
  IF NEW.rating_count               IS DISTINCT FROM OLD.rating_count               THEN RAISE EXCEPTION 'Not allowed: rating_count is server-only'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_business_profiles_privileged_columns ON public.business_profiles;
CREATE TRIGGER trg_guard_business_profiles_privileged_columns
BEFORE UPDATE ON public.business_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_business_profiles_privileged_columns();
