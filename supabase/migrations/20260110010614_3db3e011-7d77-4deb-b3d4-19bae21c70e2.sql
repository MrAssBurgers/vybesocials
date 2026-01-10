-- Create a database function to get posts with counts in a single query
CREATE OR REPLACE FUNCTION public.get_posts_with_counts(
  p_type text DEFAULT NULL,
  p_author_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  type text,
  media_url text,
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
  is_bookmarked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.type,
    p.media_url,
    p.thumbnail_url,
    p.caption,
    p.tags,
    p.created_at,
    COALESCE(p.is_pinned, false) as is_pinned,
    pr.id as author_id,
    pr.username as author_username,
    pr.avatar_url as author_avatar_url,
    (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
    (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
    CASE WHEN p_user_id IS NOT NULL THEN 
      EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = p_user_id)
    ELSE false END as is_liked,
    CASE WHEN p_user_id IS NOT NULL THEN 
      EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = p_user_id)
    ELSE false END as is_bookmarked
  FROM posts p
  JOIN profiles pr ON p.author_id = pr.id
  WHERE 
    (p_type IS NULL OR p.type = p_type)
    AND (p_author_id IS NULL OR p.author_id = p_author_id)
    AND p.media_url IS NOT NULL
    AND p.media_url != ''
  ORDER BY 
    COALESCE(p.is_pinned, false) DESC,
    p.created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

-- Create a function for following posts
CREATE OR REPLACE FUNCTION public.get_following_posts_with_counts(
  p_user_id uuid,
  p_type text DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  type text,
  media_url text,
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
  is_bookmarked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.type,
    p.media_url,
    p.thumbnail_url,
    p.caption,
    p.tags,
    p.created_at,
    COALESCE(p.is_pinned, false) as is_pinned,
    pr.id as author_id,
    pr.username as author_username,
    pr.avatar_url as author_avatar_url,
    (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
    (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
    EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = p_user_id) as is_liked,
    EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = p_user_id) as is_bookmarked
  FROM posts p
  JOIN profiles pr ON p.author_id = pr.id
  WHERE 
    p.author_id IN (SELECT f.following_id FROM follows f WHERE f.follower_id = p_user_id)
    AND (p_type IS NULL OR p.type = p_type)
    AND p.media_url IS NOT NULL
    AND p.media_url != ''
  ORDER BY 
    COALESCE(p.is_pinned, false) DESC,
    p.created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_posts_type_created ON posts(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);