
-- Helper: identify privileged callers allowed to write protected columns.
CREATE OR REPLACE FUNCTION public.is_privileged_writer()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r text;
BEGIN
  r := current_setting('role', true);
  IF r IN ('service_role','supabase_admin','postgres') THEN
    RETURN true;
  END IF;
  -- auth.uid() null => backend/edge context without user JWT
  IF auth.uid() IS NULL THEN
    RETURN true;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN true;
  END IF;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- ============================================================
-- profiles: block self-writes to privileged columns
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_profiles_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;
  IF NEW.is_premium IS DISTINCT FROM OLD.is_premium
     OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.coins_balance IS DISTINCT FROM OLD.coins_balance
     OR NEW.premium_expires_at IS DISTINCT FROM OLD.premium_expires_at
     OR NEW.badge_settings IS DISTINCT FROM OLD.badge_settings
     OR NEW.equipped_badge_id IS DISTINCT FROM OLD.equipped_badge_id
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
  THEN
    RAISE EXCEPTION 'Not authorized to modify privileged profile columns';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profiles_privileged_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_privileged_columns();

-- ============================================================
-- creator_profiles: block self-approval and earnings tampering
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_creator_profiles_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;
  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved
     OR NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.total_earnings IS DISTINCT FROM OLD.total_earnings
     OR NEW.pending_payout IS DISTINCT FROM OLD.pending_payout
     OR NEW.subscriber_count IS DISTINCT FROM OLD.subscriber_count
  THEN
    RAISE EXCEPTION 'Not authorized to modify creator approval or earnings columns';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_creator_profiles_privileged_columns ON public.creator_profiles;
CREATE TRIGGER trg_guard_creator_profiles_privileged_columns
BEFORE UPDATE ON public.creator_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_creator_profiles_privileged_columns();

-- ============================================================
-- business_profiles: block self-verification and revenue tampering
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_business_profiles_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.total_sales IS DISTINCT FROM OLD.total_sales
     OR NEW.total_revenue IS DISTINCT FROM OLD.total_revenue
     OR NEW.rating_average IS DISTINCT FROM OLD.rating_average
     OR NEW.rating_count IS DISTINCT FROM OLD.rating_count
     OR NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
  THEN
    RAISE EXCEPTION 'Not authorized to modify business verification or revenue columns';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_business_profiles_privileged_columns ON public.business_profiles;
CREATE TRIGGER trg_guard_business_profiles_privileged_columns
BEFORE UPDATE ON public.business_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_business_profiles_privileged_columns();

-- ============================================================
-- posts: block user manipulation of ranking/quality/trending/view/impression
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_posts_ranking_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;
  IF NEW.ranking_score IS DISTINCT FROM OLD.ranking_score
     OR NEW.quality_score IS DISTINCT FROM OLD.quality_score
     OR NEW.trending_score IS DISTINCT FROM OLD.trending_score
     OR NEW.view_count IS DISTINCT FROM OLD.view_count
     OR NEW.impression_count IS DISTINCT FROM OLD.impression_count
  THEN
    RAISE EXCEPTION 'Not authorized to modify algorithmic ranking columns';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_posts_ranking_columns ON public.posts;
CREATE TRIGGER trg_guard_posts_ranking_columns
BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.guard_posts_ranking_columns();
