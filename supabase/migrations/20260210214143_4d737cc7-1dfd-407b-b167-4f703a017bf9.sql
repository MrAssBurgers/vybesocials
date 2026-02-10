
-- FIX: Restrict business_profiles table to hide sensitive columns from non-owners
-- The business_profiles_public view already masks PII properly, but direct table access leaks it.
-- Solution: Use column-level grants instead of table-level SELECT

-- Revoke full SELECT, then grant only safe columns
REVOKE SELECT ON public.business_profiles FROM authenticated;
REVOKE SELECT ON public.business_profiles FROM anon;

-- Grant SELECT on non-sensitive columns only
GRANT SELECT (
  id, owner_id, name, slug, description, logo_url, banner_url, 
  category, website, location, social_links, business_hours,
  is_verified, is_active, stripe_onboarding_complete,
  total_sales, rating_average, rating_count, view_count,
  created_at, updated_at
) ON public.business_profiles TO authenticated;

-- Owner can see their own sensitive fields via the business_profiles_public view (which has CASE masking)
-- or via a specific policy + view pattern

-- Grant the business_profiles_public view full access (it already masks PII)
GRANT SELECT ON public.business_profiles_public TO authenticated;
GRANT SELECT ON public.business_profiles_public TO anon;
