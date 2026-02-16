
-- Ad campaign status enum
CREATE TYPE public.ad_status AS ENUM ('draft', 'pending_review', 'active', 'paused', 'completed', 'rejected');

-- Ad placement types
CREATE TYPE public.ad_placement AS ENUM ('feed_inline', 'story', 'boosted_post', 'sidebar');

-- Ad campaigns table
CREATE TABLE public.ad_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  advertiser_id UUID NOT NULL REFERENCES public.profiles(id),
  business_id UUID REFERENCES public.business_profiles(id),
  name TEXT NOT NULL,
  status ad_status NOT NULL DEFAULT 'draft',
  placement ad_placement NOT NULL DEFAULT 'feed_inline',
  -- Budget & bidding
  daily_budget NUMERIC(10,2) NOT NULL DEFAULT 10.00,
  total_budget NUMERIC(10,2),
  bid_amount_cpm NUMERIC(10,2) NOT NULL DEFAULT 2.00, -- bid per 1000 impressions
  spent NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Creative
  headline TEXT NOT NULL,
  body_text TEXT,
  media_url TEXT,
  cta_text TEXT DEFAULT 'Learn More',
  cta_url TEXT,
  -- Targeting
  target_interests TEXT[],
  target_age_min INTEGER,
  target_age_max INTEGER,
  target_locations TEXT[],
  -- Schedule
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  -- Metrics (denormalized for fast reads)
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(5,4) NOT NULL DEFAULT 0, -- click-through rate
  effective_cpm NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Moderation
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ad impressions log (for fraud prevention & analytics)
CREATE TABLE public.ad_impressions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES public.profiles(id),
  placement ad_placement NOT NULL,
  ip_hash TEXT, -- hashed for privacy, fraud detection
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  clicked BOOLEAN NOT NULL DEFAULT false,
  clicked_at TIMESTAMPTZ
);

-- Ad credits for business accounts
CREATE TABLE public.ad_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.business_profiles(id),
  amount NUMERIC(10,2) NOT NULL,
  remaining NUMERIC(10,2) NOT NULL,
  source TEXT NOT NULL DEFAULT 'purchase', -- purchase, bonus, promo
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily ad performance snapshots
CREATE TABLE public.ad_daily_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  spent NUMERIC(10,2) NOT NULL DEFAULT 0,
  cpm NUMERIC(10,2) NOT NULL DEFAULT 0,
  ctr NUMERIC(5,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, stat_date)
);

-- Indexes
CREATE INDEX idx_ad_campaigns_advertiser ON public.ad_campaigns(advertiser_id);
CREATE INDEX idx_ad_campaigns_status ON public.ad_campaigns(status);
CREATE INDEX idx_ad_impressions_campaign ON public.ad_impressions(campaign_id);
CREATE INDEX idx_ad_impressions_viewer ON public.ad_impressions(viewer_id);
CREATE INDEX idx_ad_impressions_viewed_at ON public.ad_impressions(viewed_at);
CREATE INDEX idx_ad_daily_stats_campaign_date ON public.ad_daily_stats(campaign_id, stat_date);
CREATE INDEX idx_ad_credits_business ON public.ad_credits(business_id);

-- RLS
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_daily_stats ENABLE ROW LEVEL SECURITY;

-- Advertisers see their own campaigns
CREATE POLICY "Advertisers manage own campaigns" ON public.ad_campaigns
  FOR ALL USING (advertiser_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (advertiser_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Admins see all campaigns
CREATE POLICY "Admins manage all campaigns" ON public.ad_campaigns
  FOR ALL USING (public.is_admin(auth.uid()));

-- Active ads visible to all (for serving)
CREATE POLICY "Active ads visible to all" ON public.ad_campaigns
  FOR SELECT USING (status = 'active');

-- Impressions: anyone can insert (ad views), advertisers see their own
CREATE POLICY "Anyone can log impressions" ON public.ad_impressions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Advertisers see own impressions" ON public.ad_impressions
  FOR SELECT USING (
    campaign_id IN (SELECT id FROM ad_campaigns WHERE advertiser_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
    OR public.is_admin(auth.uid())
  );

-- Credits: business owners see their own
CREATE POLICY "Business owners see own credits" ON public.ad_credits
  FOR SELECT USING (
    business_id IN (SELECT id FROM business_profiles WHERE owner_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Admins manage credits" ON public.ad_credits
  FOR ALL USING (public.is_admin(auth.uid()));

-- Daily stats: advertisers see their own
CREATE POLICY "Advertisers see own stats" ON public.ad_daily_stats
  FOR SELECT USING (
    campaign_id IN (SELECT id FROM ad_campaigns WHERE advertiser_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
    OR public.is_admin(auth.uid())
  );

-- Auction function: select winning ad for a placement
CREATE OR REPLACE FUNCTION public.get_winning_ad(p_placement ad_placement, p_viewer_id uuid DEFAULT NULL)
RETURNS TABLE(campaign_id uuid, headline text, body_text text, media_url text, cta_text text, cta_url text, advertiser_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as campaign_id, c.headline, c.body_text, c.media_url, c.cta_text, c.cta_url, c.advertiser_id
  FROM ad_campaigns c
  WHERE c.status = 'active'
    AND c.placement = p_placement
    AND (c.starts_at IS NULL OR c.starts_at <= now())
    AND (c.ends_at IS NULL OR c.ends_at > now())
    AND (c.total_budget IS NULL OR c.spent < c.total_budget)
    AND c.spent < c.daily_budget * (EXTRACT(EPOCH FROM (now() - c.created_at)) / 86400 + 1)
    -- Exclude if viewer already saw this ad recently (fraud prevention)
    AND (p_viewer_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM ad_impressions ai 
      WHERE ai.campaign_id = c.id AND ai.viewer_id = p_viewer_id 
      AND ai.viewed_at > now() - INTERVAL '1 hour'
    ))
  ORDER BY c.bid_amount_cpm * (1 + random() * 0.2) DESC -- auction with slight randomness
  LIMIT 1;
END;
$$;

-- Record impression and update campaign metrics
CREATE OR REPLACE FUNCTION public.record_ad_impression(p_campaign_id uuid, p_viewer_id uuid DEFAULT NULL, p_clicked boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_bid NUMERIC;
  v_cost NUMERIC;
BEGIN
  -- Get bid amount
  SELECT bid_amount_cpm INTO v_bid FROM ad_campaigns WHERE id = p_campaign_id;
  v_cost := COALESCE(v_bid, 2.00) / 1000.0; -- cost per single impression

  -- Log impression
  INSERT INTO ad_impressions (campaign_id, viewer_id, clicked, clicked_at)
  VALUES (p_campaign_id, p_viewer_id, p_clicked, CASE WHEN p_clicked THEN now() ELSE NULL END);

  -- Update campaign totals
  UPDATE ad_campaigns SET
    impressions = impressions + 1,
    clicks = clicks + CASE WHEN p_clicked THEN 1 ELSE 0 END,
    spent = spent + v_cost,
    ctr = CASE WHEN impressions + 1 > 0 THEN (clicks + CASE WHEN p_clicked THEN 1 ELSE 0 END)::numeric / (impressions + 1) ELSE 0 END,
    effective_cpm = CASE WHEN impressions + 1 > 0 THEN (spent + v_cost) / ((impressions + 1)::numeric / 1000) ELSE 0 END,
    updated_at = now()
  WHERE id = p_campaign_id;

  -- Upsert daily stats
  INSERT INTO ad_daily_stats (campaign_id, stat_date, impressions, clicks, spent)
  VALUES (p_campaign_id, CURRENT_DATE, 1, CASE WHEN p_clicked THEN 1 ELSE 0 END, v_cost)
  ON CONFLICT (campaign_id, stat_date) DO UPDATE SET
    impressions = ad_daily_stats.impressions + 1,
    clicks = ad_daily_stats.clicks + CASE WHEN p_clicked THEN 1 ELSE 0 END,
    spent = ad_daily_stats.spent + v_cost,
    cpm = CASE WHEN ad_daily_stats.impressions + 1 > 0 THEN (ad_daily_stats.spent + v_cost) / ((ad_daily_stats.impressions + 1)::numeric / 1000) ELSE 0 END,
    ctr = CASE WHEN ad_daily_stats.impressions + 1 > 0 THEN (ad_daily_stats.clicks + CASE WHEN p_clicked THEN 1 ELSE 0 END)::numeric / (ad_daily_stats.impressions + 1) ELSE 0 END;
END;
$$;
