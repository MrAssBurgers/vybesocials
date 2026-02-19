
-- Update the get_profile_posts_rpc function to use the correct project ID for media URL filtering
CREATE OR REPLACE FUNCTION public.get_profile_posts_rpc(profile_id_input uuid, viewer_id_input uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, user_id uuid, content text, media_url text, media_type text,
  created_at timestamptz, likes_count bigint, comments_count bigint,
  is_pinned boolean, has_poll boolean, poll_question text, poll_options jsonb,
  poll_ends_at timestamptz, is_liked boolean, is_bookmarked boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT 
      p.id, p.user_id, p.content, p.media_url, p.media_type,
      p.created_at, p.likes_count, p.comments_count,
      COALESCE(p.is_pinned, false) as is_pinned,
      p.has_poll, p.poll_question, p.poll_options, p.poll_ends_at,
      CASE WHEN viewer_id_input IS NOT NULL THEN
        EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = viewer_id_input)
      ELSE false END as is_liked,
      CASE WHEN viewer_id_input IS NOT NULL THEN
        EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = viewer_id_input)
      ELSE false END as is_bookmarked
    FROM posts p
    WHERE p.user_id = profile_id_input
      AND p.media_url IS NOT NULL
      AND p.media_url != ''
      AND p.media_url LIKE '%agtcyxjxgkdyoxwxkjth%'
    ORDER BY 
      COALESCE(p.is_pinned, false) DESC,
      p.created_at DESC;
END;
$$;
