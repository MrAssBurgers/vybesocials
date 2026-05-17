CREATE OR REPLACE FUNCTION public.get_landing_top_creators(_limit integer DEFAULT 4)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent_posts AS (
    SELECT p.id, p.author_id, p.view_count
    FROM posts p
    WHERE p.created_at > now() - interval '24 hours'
  ),
  scored AS (
    SELECT
      rp.author_id,
      SUM(
        COALESCE(rp.view_count, 0) * 0.1
        + COALESCE((SELECT count(*) FROM likes l WHERE l.post_id = rp.id), 0) * 1
        + COALESCE((SELECT count(*) FROM comments c WHERE c.post_id = rp.id), 0) * 3
      )::numeric AS score
    FROM recent_posts rp
    GROUP BY rp.author_id
  )
  SELECT pr.id, pr.username, pr.display_name, pr.avatar_url,
         COALESCE(s.score, 0)::numeric AS score
  FROM profiles pr
  LEFT JOIN scored s ON s.author_id = pr.id
  WHERE COALESCE(pr.is_private, false) = false
    AND pr.feature_on_landing = true
    AND pr.avatar_url IS NOT NULL
  ORDER BY COALESCE(s.score, 0) DESC, pr.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 12));
$$;