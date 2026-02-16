
-- Creator Partner Program tier enum
CREATE TYPE public.creator_tier AS ENUM ('none', 'emerging', 'verified', 'elite');

-- Creator profiles: tracks partner status, tier, and aggregate earnings
CREATE TABLE public.creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier creator_tier NOT NULL DEFAULT 'none',
  is_approved BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  tier_upgraded_at TIMESTAMPTZ,
  total_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
  pending_payout NUMERIC(12,2) NOT NULL DEFAULT 0,
  lifetime_views BIGINT NOT NULL DEFAULT 0,
  lifetime_ad_impressions BIGINT NOT NULL DEFAULT 0,
  subscriber_count INTEGER NOT NULL DEFAULT 0,
  stripe_connect_account_id TEXT,
  stripe_onboarding_complete BOOLEAN DEFAULT false,
  tax_form_submitted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Revenue events: individual earning records for creators
CREATE TABLE public.creator_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('ad_revenue', 'subscription', 'tip', 'brand_deal')),
  gross_amount NUMERIC(10,2) NOT NULL,
  platform_fee_pct NUMERIC(5,2) NOT NULL,
  platform_fee NUMERIC(10,2) NOT NULL,
  creator_amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  period_start DATE,
  period_end DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'paid', 'failed')),
  paid_at TIMESTAMPTZ,
  stripe_transfer_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payout requests
CREATE TABLE public.creator_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'completed', 'failed')),
  stripe_payout_id TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  failed_reason TEXT
);

-- Daily analytics snapshots for creator dashboard
CREATE TABLE public.creator_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  views BIGINT NOT NULL DEFAULT 0,
  ad_impressions BIGINT NOT NULL DEFAULT 0,
  ad_revenue NUMERIC(10,4) NOT NULL DEFAULT 0,
  subscription_revenue NUMERIC(10,4) NOT NULL DEFAULT 0,
  tip_revenue NUMERIC(10,4) NOT NULL DEFAULT 0,
  new_subscribers INTEGER NOT NULL DEFAULT 0,
  cpm NUMERIC(8,4) DEFAULT 0,
  rpm NUMERIC(8,4) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(creator_id, stat_date)
);

-- Enable RLS
ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_daily_stats ENABLE ROW LEVEL SECURITY;

-- Creator profiles: users can read their own, admins can read all
CREATE POLICY "Users can view own creator profile"
  ON public.creator_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own creator profile"
  ON public.creator_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own creator profile"
  ON public.creator_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all creator profiles"
  ON public.creator_profiles FOR ALL
  USING (public.is_owner(auth.uid()) OR public.is_admin(auth.uid()));

-- Creator earnings: creators see their own
CREATE POLICY "Creators can view own earnings"
  ON public.creator_earnings FOR SELECT
  USING (creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage earnings"
  ON public.creator_earnings FOR ALL
  USING (public.is_owner(auth.uid()) OR public.is_admin(auth.uid()));

-- Creator payouts: creators see their own
CREATE POLICY "Creators can view own payouts"
  ON public.creator_payouts FOR SELECT
  USING (creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Creators can request payouts"
  ON public.creator_payouts FOR INSERT
  WITH CHECK (creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage payouts"
  ON public.creator_payouts FOR ALL
  USING (public.is_owner(auth.uid()) OR public.is_admin(auth.uid()));

-- Daily stats: creators see their own
CREATE POLICY "Creators can view own daily stats"
  ON public.creator_daily_stats FOR SELECT
  USING (creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage daily stats"
  ON public.creator_daily_stats FOR ALL
  USING (public.is_owner(auth.uid()) OR public.is_admin(auth.uid()));

-- Helper function: get revenue split percentages by tier and source
CREATE OR REPLACE FUNCTION public.get_creator_revenue_split(p_tier creator_tier, p_source text)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    -- Ad revenue: Creator gets 60%
    WHEN p_source = 'ad_revenue' THEN 60.0
    -- Subscriptions: Creator gets 80%
    WHEN p_source = 'subscription' THEN 80.0
    -- Tips: Creator gets 85%
    WHEN p_source = 'tip' THEN 85.0
    -- Brand deals: Creator gets 75%
    WHEN p_source = 'brand_deal' THEN 75.0
    ELSE 60.0
  END
$$;

-- Function to check if is_admin exists, create if not
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles_auth
    WHERE user_id = _user_id AND role IN ('admin', 'owner')
  )
$$;

-- Indexes for performance
CREATE INDEX idx_creator_profiles_user_id ON public.creator_profiles(user_id);
CREATE INDEX idx_creator_profiles_tier ON public.creator_profiles(tier);
CREATE INDEX idx_creator_earnings_creator_id ON public.creator_earnings(creator_id);
CREATE INDEX idx_creator_earnings_created_at ON public.creator_earnings(created_at);
CREATE INDEX idx_creator_daily_stats_creator_date ON public.creator_daily_stats(creator_id, stat_date);
CREATE INDEX idx_creator_payouts_creator_id ON public.creator_payouts(creator_id);
