
DROP FUNCTION IF EXISTS public.get_ranked_feed(uuid, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_ranked_feed(
  p_user_id uuid,
  p_content_type text DEFAULT 'post',
  p_page int DEFAULT 0,
  p_page_size int DEFAULT 15
)
RETURNS TABLE(
  post_id uuid,
  post_type text,
  media_url text,
  media_urls text[],
  thumbnail_url text,
  caption text,
  tags text[],
  created_at timestamptz,
  is_pinned boolean,
  view_count int,
  author_id uuid,
  author_username text,
  author_avatar text,
  like_count bigint,
  comment_count bigint,
  is_liked boolean,
  is_bookmarked boolean,
  rank_score double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset int := p_page * p_page_size;
BEGIN
  RETURN QUERY
  WITH user_moods AS (
    SELECT rmp.mood, rmp.score
    FROM reaction_mood_profiles rmp
    WHERE rmp.user_id = p_user_id
    ORDER BY rmp.score DESC
    LIMIT 7
  ),
  not_interested AS (
    SELECT DISTINCT ui.post_id 
    FROM user_interactions ui
    WHERE ui.user_id = p_user_id 
      AND ui.interaction_type = 'not_interested'
  ),
  post_data AS (
    SELECT 
      p.id,
      p.type,
      p.media_url AS p_media_url,
      p.media_urls AS p_media_urls,
      p.thumbnail_url AS p_thumbnail_url,
      p.caption AS p_caption,
      p.tags AS p_tags,
      p.created_at AS p_created_at,
      p.is_pinned AS p_is_pinned,
      COALESCE(p.view_count, 0) AS p_view_count,
      p.author_id AS p_author_id,
      prof.username AS p_author_username,
      prof.avatar_url AS p_author_avatar,
      COALESCE(lc.cnt, 0) AS p_like_count,
      COALESCE(cc.cnt, 0) AS p_comment_count,
      EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = p_user_id) AS p_is_liked,
      EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = p_user_id) AS p_is_bookmarked,
      (
        COALESCE(lc.cnt, 0) * 1.0 +
        COALESCE(cc.cnt, 0) * 3.0 +
        COALESCE(p.view_count, 0) * 0.1 +
        CASE WHEN p.is_pinned THEN 50 ELSE 0 END
      ) AS engagement_base,
      GREATEST(0.3, 1.0 - EXTRACT(EPOCH FROM (now() - p.created_at)) / (7 * 86400) * 0.7) AS recency_mult,
      COALESCE(
        (SELECT SUM(pms.signal_strength * COALESCE(um.score, 0)) 
         FROM post_mood_signals pms
         LEFT JOIN user_moods um ON um.mood = pms.mood
         WHERE pms.post_id = p.id),
        0
      ) AS mood_match_score
    FROM posts p
    JOIN profiles prof ON prof.id = p.author_id
    LEFT JOIN (SELECT lk.post_id, COUNT(*)::bigint AS cnt FROM likes lk GROUP BY lk.post_id) lc ON lc.post_id = p.id
    LEFT JOIN (SELECT cm.post_id, COUNT(*)::bigint AS cnt FROM comments cm GROUP BY cm.post_id) cc ON cc.post_id = p.id
    WHERE (p_content_type = 'all' OR p.type = p_content_type)
      AND p.id NOT IN (SELECT ni.post_id FROM not_interested ni)
      AND p.author_id != p_user_id
  )
  SELECT 
    pd.id AS post_id,
    pd.type AS post_type,
    pd.p_media_url AS media_url,
    pd.p_media_urls AS media_urls,
    pd.p_thumbnail_url AS thumbnail_url,
    pd.p_caption AS caption,
    pd.p_tags AS tags,
    pd.p_created_at AS created_at,
    pd.p_is_pinned AS is_pinned,
    pd.p_view_count::int AS view_count,
    pd.p_author_id AS author_id,
    pd.p_author_username AS author_username,
    pd.p_author_avatar AS author_avatar,
    pd.p_like_count AS like_count,
    pd.p_comment_count AS comment_count,
    pd.p_is_liked AS is_liked,
    pd.p_is_bookmarked AS is_bookmarked,
    (
      (pd.engagement_base * pd.recency_mult) +
      (pd.mood_match_score * 2.0)
    )::double precision AS rank_score
  FROM post_data pd
  ORDER BY rank_score DESC, pd.p_created_at DESC
  OFFSET v_offset
  LIMIT p_page_size;
END;
$$;
