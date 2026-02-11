-- Drop existing functions that need return type changes
DROP FUNCTION IF EXISTS public.get_posts_with_counts(text, uuid, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.get_following_posts_with_counts(uuid, text, integer, integer);

-- Recreate with media_urls in return type
CREATE OR REPLACE FUNCTION public.get_posts_with_counts(p_type text DEFAULT NULL::text, p_author_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 15)
 RETURNS TABLE(id uuid, type text, media_url text, media_urls text[], thumbnail_url text, caption text, tags text[], created_at timestamp with time zone, is_pinned boolean, view_count integer, author_id uuid, author_username text, author_avatar_url text, like_count bigint, comment_count bigint, is_liked boolean, is_bookmarked boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH post_base AS (
    SELECT 
      p.id, p.type, p.media_url, p.media_urls, p.thumbnail_url, p.caption, p.tags, p.created_at,
      COALESCE(p.is_pinned, false) as is_pinned, COALESCE(p.view_count, 0) as view_count, p.author_id
    FROM posts p
    WHERE (p_type IS NULL OR p.type = p_type)
      AND (p_author_id IS NULL OR p.author_id = p_author_id)
    ORDER BY COALESCE(p.is_pinned, false) DESC, p.created_at DESC
    OFFSET p_offset LIMIT p_limit
  ),
  like_counts AS (
    SELECT l.post_id, COUNT(*) as cnt FROM likes l WHERE l.post_id IN (SELECT pb.id FROM post_base pb) GROUP BY l.post_id
  ),
  comment_counts AS (
    SELECT c.post_id, COUNT(*) as cnt FROM comments c WHERE c.post_id IN (SELECT pb.id FROM post_base pb) GROUP BY c.post_id
  ),
  user_likes AS (
    SELECT l.post_id FROM likes l WHERE p_user_id IS NOT NULL AND l.user_id = p_user_id AND l.post_id IN (SELECT pb.id FROM post_base pb)
  ),
  user_bookmarks AS (
    SELECT b.post_id FROM bookmarks b WHERE p_user_id IS NOT NULL AND b.user_id = p_user_id AND b.post_id IN (SELECT pb.id FROM post_base pb)
  )
  SELECT pb.id, pb.type, pb.media_url, pb.media_urls, pb.thumbnail_url, pb.caption, pb.tags, pb.created_at, pb.is_pinned, pb.view_count::integer,
    pr.id as author_id, pr.username as author_username, pr.avatar_url as author_avatar_url,
    COALESCE(lc.cnt, 0) as like_count, COALESCE(cc.cnt, 0) as comment_count,
    EXISTS(SELECT 1 FROM user_likes ul WHERE ul.post_id = pb.id) as is_liked,
    EXISTS(SELECT 1 FROM user_bookmarks ub WHERE ub.post_id = pb.id) as is_bookmarked
  FROM post_base pb
  JOIN profiles pr ON pb.author_id = pr.id
  LEFT JOIN like_counts lc ON lc.post_id = pb.id
  LEFT JOIN comment_counts cc ON cc.post_id = pb.id
  ORDER BY pb.is_pinned DESC, pb.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_following_posts_with_counts(p_user_id uuid, p_type text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 15)
 RETURNS TABLE(id uuid, type text, media_url text, media_urls text[], thumbnail_url text, caption text, tags text[], created_at timestamp with time zone, is_pinned boolean, view_count integer, author_id uuid, author_username text, author_avatar_url text, like_count bigint, comment_count bigint, is_liked boolean, is_bookmarked boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH following_ids AS (
    SELECT f.following_id FROM follows f WHERE f.follower_id = p_user_id
  ),
  post_base AS (
    SELECT 
      p.id, p.type, p.media_url, p.media_urls, p.thumbnail_url, p.caption, p.tags, p.created_at,
      COALESCE(p.is_pinned, false) as is_pinned, COALESCE(p.view_count, 0) as view_count, p.author_id
    FROM posts p
    WHERE p.author_id IN (SELECT fi.following_id FROM following_ids fi)
      AND (p_type IS NULL OR p.type = p_type)
    ORDER BY COALESCE(p.is_pinned, false) DESC, p.created_at DESC
    OFFSET p_offset LIMIT p_limit
  ),
  like_counts AS (
    SELECT l.post_id, COUNT(*) as cnt FROM likes l WHERE l.post_id IN (SELECT pb.id FROM post_base pb) GROUP BY l.post_id
  ),
  comment_counts AS (
    SELECT c.post_id, COUNT(*) as cnt FROM comments c WHERE c.post_id IN (SELECT pb.id FROM post_base pb) GROUP BY c.post_id
  ),
  user_likes AS (
    SELECT l.post_id FROM likes l WHERE l.user_id = p_user_id AND l.post_id IN (SELECT pb.id FROM post_base pb)
  ),
  user_bookmarks AS (
    SELECT b.post_id FROM bookmarks b WHERE b.user_id = p_user_id AND b.post_id IN (SELECT pb.id FROM post_base pb)
  )
  SELECT pb.id, pb.type, pb.media_url, pb.media_urls, pb.thumbnail_url, pb.caption, pb.tags, pb.created_at, pb.is_pinned, pb.view_count::integer,
    pr.id as author_id, pr.username as author_username, pr.avatar_url as author_avatar_url,
    COALESCE(lc.cnt, 0) as like_count, COALESCE(cc.cnt, 0) as comment_count,
    EXISTS(SELECT 1 FROM user_likes ul WHERE ul.post_id = pb.id) as is_liked,
    EXISTS(SELECT 1 FROM user_bookmarks ub WHERE ub.post_id = pb.id) as is_bookmarked
  FROM post_base pb
  JOIN profiles pr ON pb.author_id = pr.id
  LEFT JOIN like_counts lc ON lc.post_id = pb.id
  LEFT JOIN comment_counts cc ON cc.post_id = pb.id
  ORDER BY pb.is_pinned DESC, pb.created_at DESC;
END;
$function$;