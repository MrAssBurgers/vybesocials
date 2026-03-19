
-- Video stats table for tracking individual post/video performance
CREATE TABLE public.video_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  views INTEGER NOT NULL DEFAULT 0,
  qualified_views INTEGER NOT NULL DEFAULT 0,
  avg_watch_time NUMERIC(6,2) NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id)
);

ALTER TABLE public.video_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view own video stats"
  ON public.video_stats FOR SELECT
  USING (creator_id IN (SELECT id FROM creator_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage video stats"
  ON public.video_stats FOR ALL
  USING (public.is_owner(auth.uid()) OR public.is_admin(auth.uid()));

CREATE INDEX idx_video_stats_creator_id ON public.video_stats(creator_id);
CREATE INDEX idx_video_stats_post_id ON public.video_stats(post_id);

-- Add premium columns to profiles if not exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMPTZ;

-- Earnings calculation function (called by cron)
CREATE OR REPLACE FUNCTION public.calculate_creator_earnings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_rate NUMERIC := 2.50; -- $2.50 per 1000 qualified views
  processed_count INTEGER := 0;
  creator RECORD;
BEGIN
  -- Loop through active creators with pending stats
  FOR creator IN
    SELECT cp.id as creator_id, cp.user_id, cp.tier,
           COALESCE(SUM(vs.qualified_views), 0) as total_qualified_views,
           COALESCE(AVG(vs.avg_watch_time), 0) as avg_watch,
           COALESCE(SUM(vs.likes + vs.comments + vs.shares), 0) as engagement
    FROM creator_profiles cp
    JOIN video_stats vs ON vs.creator_id = cp.id
    WHERE cp.is_approved = true
      AND vs.updated_at >= NOW() - INTERVAL '1 hour'
    GROUP BY cp.id, cp.user_id, cp.tier
    HAVING SUM(vs.qualified_views) > 0
  LOOP
    DECLARE
      watch_multiplier NUMERIC;
      engagement_multiplier NUMERIC;
      earnings NUMERIC;
      rev_share NUMERIC;
    BEGIN
      -- Watch time multiplier (0.5x to 2x based on avg watch time)
      watch_multiplier := LEAST(2.0, GREATEST(0.5, creator.avg_watch / 15.0));
      
      -- Engagement multiplier (1x to 1.5x)
      engagement_multiplier := LEAST(1.5, 1.0 + (creator.engagement::NUMERIC / GREATEST(creator.total_qualified_views, 1)) * 0.5);
      
      -- Revenue share based on tier
      rev_share := CASE creator.tier
        WHEN 'elite' THEN 0.70
        WHEN 'verified' THEN 0.65
        ELSE 0.60
      END;
      
      -- Earnings = (qualified_views / 1000) * base_rate * multipliers * rev_share
      earnings := (creator.total_qualified_views / 1000.0) * base_rate * watch_multiplier * engagement_multiplier * rev_share;
      
      IF earnings > 0.01 THEN
        INSERT INTO creator_earnings (creator_id, amount, source, description, created_at)
        VALUES (creator.creator_id, ROUND(earnings, 2), 'ad_revenue', 
                'Hourly earnings: ' || creator.total_qualified_views || ' views', NOW());
        
        -- Update pending payout
        UPDATE creator_profiles 
        SET pending_payout = COALESCE(pending_payout, 0) + ROUND(earnings, 2),
            total_earnings = COALESCE(total_earnings, 0) + ROUND(earnings, 2)
        WHERE id = creator.creator_id;
        
        processed_count := processed_count + 1;
      END IF;
    END;
  END LOOP;
  
  RETURN jsonb_build_object('processed', processed_count, 'timestamp', NOW());
END;
$$;

-- Trending score update function (called by cron)
CREATE OR REPLACE FUNCTION public.update_trending_scores()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Update sound trend scores based on recent usage
  UPDATE sounds SET
    trend_score = (
      usage_count * 1.0 +
      COALESCE((SELECT COUNT(*) FROM track_usage tu WHERE tu.sound_id = sounds.id AND tu.used_at > NOW() - INTERVAL '24 hours'), 0) * 5.0
    ) * CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1.5 ELSE 1.0 END,
    updated_at = NOW()
  WHERE usage_count > 0 OR created_at > NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN jsonb_build_object('sounds_updated', updated_count, 'timestamp', NOW());
END;
$$;
