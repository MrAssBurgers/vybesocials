CREATE OR REPLACE FUNCTION public.update_trending_scores()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  UPDATE sounds SET
    trend_score = (
      COALESCE(usage_count, 0) * 1.0 +
      COALESCE((
        SELECT COUNT(*) FROM sound_play_events spe
        WHERE spe.sound_id = sounds.sound_id
          AND spe.created_at > NOW() - INTERVAL '24 hours'
      ), 0) * 5.0
    ) * CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1.5 ELSE 1.0 END,
    updated_at = NOW()
  WHERE COALESCE(usage_count, 0) > 0 OR created_at > NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN jsonb_build_object('sounds_updated', updated_count, 'timestamp', NOW());
END;
$$;