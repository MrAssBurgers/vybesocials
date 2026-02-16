
-- Business subscription tiers (admin-configurable)
CREATE TABLE public.business_subscription_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of feature strings
  rc_product_id TEXT, -- RevenueCat product identifier
  visibility_boost_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  analytics_level TEXT NOT NULL DEFAULT 'basic', -- basic, advanced, full
  max_products INTEGER, -- null = unlimited
  max_ad_credits_monthly NUMERIC(10,2) DEFAULT 0,
  promo_tools_enabled BOOLEAN NOT NULL DEFAULT false,
  priority_support BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Business subscriptions (which business has which tier)
CREATE TABLE public.business_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES public.business_subscription_tiers(id),
  status TEXT NOT NULL DEFAULT 'active', -- active, cancelled, expired, trial
  rc_subscription_id TEXT, -- RevenueCat subscription ID
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id)
);

-- Indexes
CREATE INDEX idx_biz_subs_business ON public.business_subscriptions(business_id);
CREATE INDEX idx_biz_subs_tier ON public.business_subscriptions(tier_id);
CREATE INDEX idx_biz_sub_tiers_active ON public.business_subscription_tiers(is_active);

-- RLS
ALTER TABLE public.business_subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;

-- Tiers: everyone can read active tiers, admins manage
CREATE POLICY "Anyone can view active tiers" ON public.business_subscription_tiers
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins manage tiers" ON public.business_subscription_tiers
  FOR ALL USING (public.is_admin(auth.uid()));

-- Subscriptions: business owners see their own, admins see all
CREATE POLICY "Business owners see own subscription" ON public.business_subscriptions
  FOR SELECT USING (
    business_id IN (
      SELECT bp.id FROM business_profiles bp 
      WHERE bp.owner_id IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())
    )
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Business owners manage own subscription" ON public.business_subscriptions
  FOR ALL USING (
    business_id IN (
      SELECT bp.id FROM business_profiles bp 
      WHERE bp.owner_id IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())
    )
  ) WITH CHECK (
    business_id IN (
      SELECT bp.id FROM business_profiles bp 
      WHERE bp.owner_id IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())
    )
  );

CREATE POLICY "Admins manage all subscriptions" ON public.business_subscriptions
  FOR ALL USING (public.is_admin(auth.uid()));
