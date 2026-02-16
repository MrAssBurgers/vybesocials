
-- Fix search_path on new functions
CREATE OR REPLACE FUNCTION public.get_creator_revenue_split(p_tier creator_tier, p_source text)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE
SET search_path = 'public'
AS $$
  SELECT CASE
    WHEN p_source = 'ad_revenue' THEN 60.0
    WHEN p_source = 'subscription' THEN 80.0
    WHEN p_source = 'tip' THEN 85.0
    WHEN p_source = 'brand_deal' THEN 75.0
    ELSE 60.0
  END
$$;
