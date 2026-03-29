CREATE OR REPLACE FUNCTION public.calculate_creator_earnings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_rate NUMERIC := 2.50;
  processed_count INTEGER := 0;
  creator RECORD;
BEGIN
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
      gross NUMERIC;
      rev_share NUMERIC;
      platform_pct NUMERIC;
      platform_cut NUMERIC;
      creator_cut NUMERIC;
    BEGIN
      watch_multiplier := LEAST(2.0, GREATEST(0.5, creator.avg_watch / 15.0));
      engagement_multiplier := LEAST(1.5, 1.0 + (creator.engagement::NUMERIC / GREATEST(creator.total_qualified_views, 1)) * 0.5);
      
      rev_share := CASE creator.tier
        WHEN 'elite' THEN 0.70
        WHEN 'verified' THEN 0.65
        ELSE 0.60
      END;
      
      platform_pct := 1.0 - rev_share;
      gross := (creator.total_qualified_views / 1000.0) * base_rate * watch_multiplier * engagement_multiplier;
      creator_cut := ROUND(gross * rev_share, 2);
      platform_cut := ROUND(gross * platform_pct, 2);
      
      IF creator_cut > 0.01 THEN
        INSERT INTO creator_earnings (creator_id, source, gross_amount, platform_fee_pct, platform_fee, creator_amount, period_start, period_end, status, metadata)
        VALUES (
          creator.creator_id, 
          'ad_revenue', 
          ROUND(gross, 2),
          platform_pct * 100,
          platform_cut,
          creator_cut,
          (NOW() - INTERVAL '1 hour')::date,
          NOW()::date,
          'pending',
          jsonb_build_object('qualified_views', creator.total_qualified_views, 'watch_multiplier', watch_multiplier, 'engagement_multiplier', engagement_multiplier)
        );
        
        UPDATE creator_profiles 
        SET pending_payout = COALESCE(pending_payout, 0) + creator_cut,
            total_earnings = COALESCE(total_earnings, 0) + creator_cut
        WHERE id = creator.creator_id;
        
        processed_count := processed_count + 1;
      END IF;
    END;
  END LOOP;
  
  RETURN jsonb_build_object('processed', processed_count, 'timestamp', NOW());
END;
$$