
CREATE TABLE IF NOT EXISTS public.algorithm_settings (
  id boolean PRIMARY KEY DEFAULT true,
  weights jsonb NOT NULL DEFAULT jsonb_build_object(
    'personal_match', 0.35, 'content_quality', 0.25, 'engagement_velocity', 0.15,
    'creator_level', 0.12, 'freshness', 0.08, 'diversity', 0.05
  ),
  penalties jsonb NOT NULL DEFAULT jsonb_build_object(
    'report', 0.4, 'skip', 0.15, 'not_interested', 0.5, 'spam', 0.6
  ),
  level_curve jsonb NOT NULL DEFAULT jsonb_build_object(
    'base', 1.0, 'log_factor', 0.08, 'max_multiplier', 1.8
  ),
  wave_thresholds jsonb NOT NULL DEFAULT jsonb_build_object(
    'wave_2', 0.55, 'wave_3', 0.65, 'wave_4', 0.75, 'wave_5', 0.85
  ),
  test_pool jsonb NOT NULL DEFAULT jsonb_build_object(
    'l1_9', jsonb_build_array(25, 75),
    'l10_49', jsonb_build_array(75, 200),
    'l50_199', jsonb_build_array(200, 500),
    'l200_999', jsonb_build_array(500, 1500),
    'l1000_plus', jsonb_build_array(1500, 5000)
  ),
  rookie_pool_pct numeric NOT NULL DEFAULT 0.10,
  diversity_max_per_creator int NOT NULL DEFAULT 2,
  freshness_half_life_hours int NOT NULL DEFAULT 48,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT algorithm_settings_singleton CHECK (id = true)
);

GRANT SELECT ON public.algorithm_settings TO authenticated;
GRANT ALL ON public.algorithm_settings TO service_role;
ALTER TABLE public.algorithm_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read settings" ON public.algorithm_settings;
CREATE POLICY "Anyone authenticated can read settings"
  ON public.algorithm_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Owners can update settings" ON public.algorithm_settings;
CREATE POLICY "Owners can update settings"
  ON public.algorithm_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

INSERT INTO public.algorithm_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS ranking_score double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ranked_at timestamptz,
  ADD COLUMN IF NOT EXISTS impression_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skip_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS report_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS not_interested_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completion_rate real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rewatch_rate real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quality_score real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_wave smallint NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_posts_ranking_score ON public.posts (ranking_score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_last_ranked_at ON public.posts (last_ranked_at);
CREATE INDEX IF NOT EXISTS idx_posts_wave_type ON public.posts (current_wave, type);

ALTER TABLE public.user_interactions DROP CONSTRAINT IF EXISTS user_interactions_interaction_type_check;
ALTER TABLE public.user_interactions
  ADD CONSTRAINT user_interactions_interaction_type_check CHECK (
    interaction_type = ANY (ARRAY[
      'view','like','comment','share','save','not_interested','watch_time',
      'skip','report','complete','rewatch','follow_creator','profile_tap'
    ])
  );

CREATE OR REPLACE FUNCTION public.get_creator_level(p_profile_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(ul.current_level, 1)
  FROM public.profiles p
  LEFT JOIN public.user_levels ul ON ul.user_id = p.user_id
  WHERE p.id = p_profile_id;
$$;

-- Compute ranking score for one post.
-- final_score = (content_quality * w_cq + engagement_velocity * w_ev
--               + creator_level * w_lvl + freshness * w_fr) * level_multiplier
--             - penalties (reports / skips / not_interested)
-- personal_match and diversity are applied per-viewer inside get_ranked_feed.
CREATE OR REPLACE FUNCTION public.compute_post_ranking(p_post_id uuid)
RETURNS double precision
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.algorithm_settings%ROWTYPE;
  p public.posts%ROWTYPE;
  v_level int; v_age_h numeric; v_imp bigint;
  v_likes bigint:=0; v_comments bigint:=0; v_shares bigint:=0; v_saves bigint:=0;
  v_views bigint:=0; v_complete bigint:=0; v_rewatch bigint:=0;
  v_skip bigint:=0; v_report bigint:=0; v_not_int bigint:=0;
  cq numeric:=0; ev numeric:=0; fresh numeric:=0;
  lvl_mult numeric:=1; lvl_score numeric:=0; penalty numeric:=0; pos numeric:=0;
  final_score double precision:=0; wave smallint:=1;
BEGIN
  SELECT * INTO s FROM public.algorithm_settings WHERE id = true;
  SELECT * INTO p FROM public.posts WHERE id = p_post_id;
  IF p.id IS NULL THEN RETURN 0; END IF;

  v_level := public.get_creator_level(p.author_id);
  v_age_h := GREATEST(0.01, EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600.0);
  v_imp   := GREATEST(1, p.impression_count);

  SELECT
    COUNT(*) FILTER (WHERE interaction_type='like'),
    COUNT(*) FILTER (WHERE interaction_type='comment'),
    COUNT(*) FILTER (WHERE interaction_type='share'),
    COUNT(*) FILTER (WHERE interaction_type='save'),
    COUNT(*) FILTER (WHERE interaction_type='view'),
    COUNT(*) FILTER (WHERE interaction_type='complete'),
    COUNT(*) FILTER (WHERE interaction_type='rewatch'),
    COUNT(*) FILTER (WHERE interaction_type='skip'),
    COUNT(*) FILTER (WHERE interaction_type='report'),
    COUNT(*) FILTER (WHERE interaction_type='not_interested')
  INTO v_likes,v_comments,v_shares,v_saves,v_views,v_complete,v_rewatch,v_skip,v_report,v_not_int
  FROM public.user_interactions WHERE post_id = p_post_id;

  -- content_quality: completion + rewatch + saves + shares + comments + likes (0..1)
  cq := LEAST(1.0,
      (v_complete::numeric / GREATEST(v_views,1)) * 0.30
    + (v_rewatch::numeric  / GREATEST(v_views,1)) * 0.15
    + LEAST(1.0, v_saves::numeric  / 50.0)  * 0.20
    + LEAST(1.0, v_shares::numeric / 50.0)  * 0.20
    + LEAST(1.0, v_comments::numeric/100.0) * 0.10
    + LEAST(1.0, v_likes::numeric  /200.0)  * 0.05);

  -- engagement_velocity: positive engagement density per impression
  pos := v_likes + 3*v_comments + 5*v_shares + 4*v_saves + 2*v_complete + v_rewatch;
  ev  := LEAST(1.0, (pos::numeric / v_imp) * 8.0);

  -- freshness: exp half-life decay
  fresh := EXP( -ln(2) * v_age_h / GREATEST(s.freshness_half_life_hours::numeric, 1) );

  -- creator_level: soft log scaling capped by max_multiplier
  lvl_mult := LEAST(
    (s.level_curve->>'max_multiplier')::numeric,
    (s.level_curve->>'base')::numeric + log(v_level::numeric + 1) * (s.level_curve->>'log_factor')::numeric
  );
  lvl_score := LEAST(1.0, log(v_level::numeric + 1) / log(1000));

  -- penalties: reports/skips/not_interested drag final_score down
  penalty :=
      LEAST(1.0, v_report::numeric  / GREATEST(v_imp::numeric/50,1))   * (s.penalties->>'report')::numeric
    + LEAST(1.0, v_skip::numeric    / v_imp::numeric)                  * (s.penalties->>'skip')::numeric
    + LEAST(1.0, v_not_int::numeric / GREATEST(v_imp::numeric/20,1))   * (s.penalties->>'not_interested')::numeric;

  final_score :=
      cq        * (s.weights->>'content_quality')::numeric
    + ev        * (s.weights->>'engagement_velocity')::numeric
    + lvl_score * (s.weights->>'creator_level')::numeric
    + fresh     * (s.weights->>'freshness')::numeric;

  final_score := final_score * lvl_mult - penalty;
  final_score := GREATEST(0, final_score);

  wave := CASE
    WHEN final_score >= (s.wave_thresholds->>'wave_5')::numeric THEN 5
    WHEN final_score >= (s.wave_thresholds->>'wave_4')::numeric THEN 4
    WHEN final_score >= (s.wave_thresholds->>'wave_3')::numeric THEN 3
    WHEN final_score >= (s.wave_thresholds->>'wave_2')::numeric THEN 2
    ELSE 1 END;

  UPDATE public.posts
     SET ranking_score = final_score,
         completion_rate = (v_complete::real / GREATEST(v_views,1)),
         rewatch_rate    = (v_rewatch::real  / GREATEST(v_views,1)),
         quality_score   = cq::real,
         not_interested_count = v_not_int::int,
         skip_count    = v_skip::int,
         report_count  = v_report::int,
         current_wave  = wave,
         last_ranked_at = now()
   WHERE id = p_post_id;

  RETURN final_score;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_active_rankings(p_hours int DEFAULT 72)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.posts
     WHERE created_at > now() - make_interval(hours => p_hours)
        OR last_ranked_at IS NULL
        OR last_ranked_at < now() - interval '15 minutes'
     ORDER BY created_at DESC LIMIT 5000
  LOOP
    PERFORM public.compute_post_ranking(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_post_impression(p_post_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.posts SET impression_count = impression_count + 1 WHERE id = p_post_id;
$$;

GRANT EXECUTE ON FUNCTION public.bump_post_impression(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_post_ranking(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_active_rankings(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_creator_level(uuid) TO authenticated, service_role;

-- Per-viewer ranked feed: ranking_score + personal_match + diversity cap
CREATE OR REPLACE FUNCTION public.get_ranked_feed(
  p_user_id uuid,
  p_content_type text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_radius_miles double precision DEFAULT NULL,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 20
) RETURNS TABLE (
  id uuid, type text, media_url text, media_urls text[], thumbnail_url text,
  caption text, tags text[], created_at timestamptz,
  author_id uuid, author_username text, author_avatar_url text,
  ranking_score double precision, personal_score double precision,
  final_score double precision, current_wave smallint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.algorithm_settings%ROWTYPE; v_interests text[];
BEGIN
  SELECT * INTO s FROM public.algorithm_settings WHERE id = true;
  SELECT COALESCE(interests, ARRAY[]::text[]) INTO v_interests
    FROM public.profiles WHERE id = p_user_id;

  RETURN QUERY
  WITH base AS (
    SELECT
      po.id, po.type, po.media_url, po.media_urls, po.thumbnail_url,
      po.caption, po.tags, po.created_at, po.author_id,
      pr.username AS author_username, pr.avatar_url AS author_avatar_url,
      po.ranking_score, po.current_wave,
      ( LEAST(1.0,
          COALESCE(
            cardinality(ARRAY(SELECT unnest(po.tags) INTERSECT SELECT unnest(v_interests)))::numeric
            / GREATEST(cardinality(po.tags),1), 0)) * 0.6
        + LEAST(1.0, COALESCE((
            SELECT COUNT(*)::numeric FROM public.user_interactions ui
             WHERE ui.user_id = p_user_id
               AND ui.interaction_type IN ('like','save','share','comment','follow_creator')
               AND ui.post_id IN (SELECT id FROM public.posts WHERE author_id = po.author_id)
          ),0) / 10.0) * 0.4
      )::double precision AS personal_score
    FROM public.posts po
    JOIN public.profiles pr ON pr.id = po.author_id
    WHERE (p_content_type IS NULL OR po.type = p_content_type)
      AND (p_category IS NULL OR p_category = ANY(po.tags))
      AND po.has_profanity = false
      AND NOT EXISTS (
        SELECT 1 FROM public.user_interactions ui
         WHERE ui.user_id = p_user_id AND ui.post_id = po.id
           AND ui.interaction_type = 'not_interested'
      )
  ),
  scored AS (
    SELECT b.*,
      (b.ranking_score + b.personal_score * (s.weights->>'personal_match')::numeric)::double precision AS final_score
    FROM base b
  ),
  ranked AS (
    SELECT s2.*,
      ROW_NUMBER() OVER (PARTITION BY s2.author_id ORDER BY s2.final_score DESC) AS per_creator_rank
    FROM scored s2
  )
  SELECT
    r.id, r.type, r.media_url, r.media_urls, r.thumbnail_url,
    r.caption, r.tags, r.created_at, r.author_id,
    r.author_username, r.author_avatar_url,
    r.ranking_score, r.personal_score, r.final_score, r.current_wave
  FROM ranked r
  WHERE r.per_creator_rank <= s.diversity_max_per_creator
  ORDER BY r.final_score DESC, r.created_at DESC
  OFFSET p_offset LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ranked_feed(uuid, text, text, double precision, double precision, double precision, int, int)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.posts_seed_ranking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.compute_post_ranking(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_seed_ranking ON public.posts;
CREATE TRIGGER trg_posts_seed_ranking
  AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_seed_ranking();
