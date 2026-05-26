
DROP FUNCTION IF EXISTS public.get_ranked_feed(uuid, text, text, double precision, double precision, double precision, int, int);

CREATE OR REPLACE FUNCTION public.get_ranked_feed_v2(
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
  caption text, tags text[], created_at timestamptz, is_pinned boolean,
  view_count integer,
  author_id uuid, author_username text, author_avatar_url text,
  like_count bigint, comment_count bigint,
  is_liked boolean, is_bookmarked boolean, reaction_type text,
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
      po.caption, po.tags, po.created_at, po.is_pinned, po.view_count,
      po.author_id, pr.username AS author_username, pr.avatar_url AS author_avatar_url,
      po.ranking_score, po.current_wave,
      -- personal_match: tag overlap + prior positive interactions with this creator
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
      AND po.author_id <> p_user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.user_interactions ui
         WHERE ui.user_id = p_user_id AND ui.post_id = po.id
           AND ui.interaction_type = 'not_interested'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.blocked_users bu
         WHERE bu.blocker_id = p_user_id AND bu.blocked_id = po.author_id
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
  ),
  page AS (
    SELECT r.* FROM ranked r
    WHERE r.per_creator_rank <= s.diversity_max_per_creator
    ORDER BY r.final_score DESC, r.created_at DESC
    OFFSET p_offset LIMIT p_limit
  )
  SELECT
    p.id, p.type, p.media_url, p.media_urls, p.thumbnail_url,
    p.caption, p.tags, p.created_at, p.is_pinned, p.view_count,
    p.author_id, p.author_username, p.author_avatar_url,
    COALESCE((SELECT COUNT(*) FROM public.likes l WHERE l.post_id = p.id), 0)::bigint AS like_count,
    COALESCE((SELECT COUNT(*) FROM public.comments c WHERE c.post_id = p.id), 0)::bigint AS comment_count,
    EXISTS (SELECT 1 FROM public.likes l WHERE l.post_id = p.id AND l.user_id = p_user_id) AS is_liked,
    EXISTS (SELECT 1 FROM public.bookmarks bk WHERE bk.post_id = p.id AND bk.user_id = p_user_id) AS is_bookmarked,
    (SELECT l.reaction_type FROM public.likes l WHERE l.post_id = p.id AND l.user_id = p_user_id LIMIT 1) AS reaction_type,
    p.ranking_score, p.personal_score, p.final_score, p.current_wave
  FROM page p;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ranked_feed_v2(uuid, text, text, double precision, double precision, double precision, int, int)
  TO authenticated, service_role;
