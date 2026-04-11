
CREATE OR REPLACE FUNCTION public.get_local_posts(
  p_lat double precision,
  p_lng double precision,
  p_radius_miles double precision DEFAULT 25,
  p_user_id uuid DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 15
)
RETURNS TABLE (
  id uuid,
  type text,
  media_url text,
  media_urls text[],
  thumbnail_url text,
  caption text,
  tags text[],
  created_at timestamptz,
  is_pinned boolean,
  author_id uuid,
  author_username text,
  author_avatar_url text,
  like_count bigint,
  comment_count bigint,
  is_liked boolean,
  is_bookmarked boolean,
  view_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH nearby_authors AS (
    SELECT DISTINCT ul.user_id
    FROM user_locations ul
    WHERE ul.sharing_enabled = true
      AND (
        3958.8 * 2 * ASIN(SQRT(
          POWER(SIN(RADIANS(ul.latitude - p_lat) / 2), 2) +
          COS(RADIANS(p_lat)) * COS(RADIANS(ul.latitude)) *
          POWER(SIN(RADIANS(ul.longitude - p_lng) / 2), 2)
        ))
      ) <= p_radius_miles
  )
  SELECT
    p.id,
    p.type::text,
    p.media_url,
    p.media_urls,
    p.thumbnail_url,
    p.caption,
    p.tags,
    p.created_at,
    p.is_pinned,
    pr.id AS author_id,
    pr.username AS author_username,
    pr.avatar_url AS author_avatar_url,
    COALESCE((SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id), 0) AS like_count,
    COALESCE((SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id), 0) AS comment_count,
    CASE WHEN p_user_id IS NOT NULL THEN EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = p_user_id) ELSE false END AS is_liked,
    CASE WHEN p_user_id IS NOT NULL THEN EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = p_user_id) ELSE false END AS is_bookmarked,
    COALESCE(p.view_count, 0)::bigint AS view_count
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  JOIN nearby_authors na ON na.user_id = p.author_id
  ORDER BY p.created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
$$;
