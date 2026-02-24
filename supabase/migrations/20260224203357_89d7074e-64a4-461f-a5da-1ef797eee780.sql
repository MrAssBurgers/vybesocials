
-- Add trending_score to posts for pre-computed ranking
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS trending_score double precision DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_posts_trending_score ON public.posts(trending_score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created_type ON public.posts(type, created_at DESC);

-- Function to recompute trending_score for a single post
-- Uses engagement velocity: (likes + comments*2 + views*0.01) / age_hours^1.5
CREATE OR REPLACE FUNCTION public.update_post_trending_score(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_like_count int;
  v_comment_count int;
  v_view_count int;
  v_age_hours double precision;
  v_score double precision;
BEGIN
  SELECT COALESCE(view_count, 0),
         GREATEST(0.1, EXTRACT(EPOCH FROM (now() - created_at)) / 3600.0)
    INTO v_view_count, v_age_hours
    FROM posts WHERE id = p_post_id;

  SELECT COUNT(*) INTO v_like_count FROM likes WHERE post_id = p_post_id;
  SELECT COUNT(*) INTO v_comment_count FROM comments WHERE post_id = p_post_id;

  -- Hacker-News-style decay: engagement / time^gravity
  v_score := (v_like_count + v_comment_count * 2.0 + v_view_count * 0.01) / POWER(v_age_hours, 1.5);

  UPDATE posts SET trending_score = v_score WHERE id = p_post_id;
END;
$$;

-- Trigger to update trending_score when likes change
CREATE OR REPLACE FUNCTION public.trg_update_trending_on_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM update_post_trending_score(OLD.post_id);
    RETURN OLD;
  ELSE
    PERFORM update_post_trending_score(NEW.post_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_likes_trending ON public.likes;
CREATE TRIGGER trg_likes_trending
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION trg_update_trending_on_like();

-- Trigger for comments
CREATE OR REPLACE FUNCTION public.trg_update_trending_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM update_post_trending_score(OLD.post_id);
    RETURN OLD;
  ELSE
    PERFORM update_post_trending_score(NEW.post_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_trending ON public.comments;
CREATE TRIGGER trg_comments_trending
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION trg_update_trending_on_comment();

-- Advanced ranked feed RPC
-- Combines: creator affinity, interest matching, engagement velocity, recency, diversity
CREATE OR REPLACE FUNCTION public.get_ranked_feed(
  p_user_id uuid,
  p_content_type text DEFAULT 'post',
  p_page int DEFAULT 0,
  p_page_size int DEFAULT 10
)
RETURNS TABLE(
  post_id uuid,
  post_type text,
  media_url text,
  thumbnail_url text,
  caption text,
  tags text[],
  created_at timestamptz,
  is_pinned boolean,
  view_count int,
  media_urls text[],
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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_interests text[];
  v_offset int := p_page * p_page_size;
BEGIN
  -- Get user interests
  SELECT COALESCE(interests, '{}')
    INTO v_user_interests
    FROM profiles WHERE id = p_user_id;

  RETURN QUERY
  WITH
  -- Posts the user explicitly hid
  hidden AS (
    SELECT ui.post_id
    FROM user_interactions ui
    WHERE ui.user_id = p_user_id AND ui.interaction_type = 'not_interested'
  ),
  -- Creator affinity: how much user engages with each creator
  affinity AS (
    SELECT
      p2.author_id AS creator_id,
      SUM(CASE ui.interaction_type
            WHEN 'like' THEN 3
            WHEN 'comment' THEN 5
            WHEN 'save' THEN 4
            WHEN 'share' THEN 4
            WHEN 'view' THEN 0.5
            WHEN 'watch_time' THEN LEAST(ui.duration_seconds::double precision / 30.0, 3)
            ELSE 0
          END
          -- Recent interactions weigh more (decay over 14 days)
          * GREATEST(0.2, 1.0 - EXTRACT(EPOCH FROM (now() - ui.created_at)) / (14.0 * 86400))
      ) AS affinity_score
    FROM user_interactions ui
    JOIN posts p2 ON p2.id = ui.post_id
    WHERE ui.user_id = p_user_id
      AND ui.interaction_type != 'not_interested'
      AND ui.created_at > now() - interval '30 days'
    GROUP BY p2.author_id
  ),
  -- Following list
  user_following AS (
    SELECT following_id FROM follows WHERE follower_id = p_user_id
  ),
  -- Candidate posts with scoring
  scored AS (
    SELECT
      p.id,
      p.type,
      p.media_url AS p_media_url,
      p.thumbnail_url AS p_thumbnail_url,
      p.caption AS p_caption,
      p.tags AS p_tags,
      p.created_at AS p_created_at,
      p.is_pinned AS p_is_pinned,
      p.view_count AS p_view_count,
      p.media_urls AS p_media_urls,
      pr.id AS p_author_id,
      pr.username AS p_author_username,
      pr.avatar_url AS p_author_avatar,
      -- Like/comment counts
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS p_like_count,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS p_comment_count,
      -- User state
      EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = p_user_id) AS p_is_liked,
      EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = p_user_id) AS p_is_bookmarked,
      -- RANK SCORE COMPONENTS:
      -- 1. Trending score (engagement velocity)
      COALESCE(p.trending_score, 0) * 30
      -- 2. Creator affinity bonus
      + COALESCE(aff.affinity_score, 0) * 20
      -- 3. Following bonus (smaller than affinity so discovery still works)
      + CASE WHEN uf.following_id IS NOT NULL THEN 15 ELSE 0 END
      -- 4. Interest tag overlap bonus
      + (SELECT COUNT(*) FROM unnest(p.tags) t WHERE t = ANY(v_user_interests))::double precision * 10
      -- 5. Recency boost (exponential decay over 48h, then slower)
      + CASE
          WHEN p.created_at > now() - interval '2 hours' THEN 50
          WHEN p.created_at > now() - interval '12 hours' THEN 30
          WHEN p.created_at > now() - interval '48 hours' THEN 15
          ELSE GREATEST(0, 5 - EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400.0)
        END
      -- 6. Pinned posts get a big boost
      + CASE WHEN p.is_pinned THEN 100 ELSE 0 END
      -- 7. Small random jitter for freshness/exploration (0-5)
      + random() * 5
      AS final_score,
      -- For diversity: row_number per author
      ROW_NUMBER() OVER (PARTITION BY p.author_id ORDER BY COALESCE(p.trending_score, 0) DESC) AS author_rank
    FROM posts p
    JOIN profiles pr ON pr.id = p.author_id
    LEFT JOIN affinity aff ON aff.creator_id = p.author_id
    LEFT JOIN user_following uf ON uf.following_id = p.author_id
    WHERE p.type = p_content_type
      AND p.id NOT IN (SELECT h.post_id FROM hidden h)
      AND p.created_at > now() - interval '30 days'
  )
  SELECT
    s.id,
    s.type,
    s.p_media_url,
    s.p_thumbnail_url,
    s.p_caption,
    s.p_tags,
    s.p_created_at,
    s.p_is_pinned,
    s.p_view_count,
    s.p_media_urls,
    s.p_author_id,
    s.p_author_username,
    s.p_author_avatar,
    s.p_like_count,
    s.p_comment_count,
    s.p_is_liked,
    s.p_is_bookmarked,
    s.final_score
  FROM scored s
  WHERE s.author_rank <= 3  -- Max 3 posts per creator in candidate pool
  ORDER BY s.final_score DESC
  OFFSET v_offset
  LIMIT p_page_size;
END;
$$;

-- Cold-start feed for unauthenticated users (trending only)
CREATE OR REPLACE FUNCTION public.get_trending_feed(
  p_content_type text DEFAULT 'post',
  p_page int DEFAULT 0,
  p_page_size int DEFAULT 10
)
RETURNS TABLE(
  post_id uuid,
  post_type text,
  media_url text,
  thumbnail_url text,
  caption text,
  tags text[],
  created_at timestamptz,
  is_pinned boolean,
  view_count int,
  media_urls text[],
  author_id uuid,
  author_username text,
  author_avatar text,
  like_count bigint,
  comment_count bigint,
  rank_score double precision
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
    p.is_pinned,
    p.view_count,
    p.media_urls,
    pr.id,
    pr.username,
    pr.avatar_url,
    (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id),
    (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id),
    COALESCE(p.trending_score, 0)
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  WHERE p.type = p_content_type
    AND p.created_at > now() - interval '14 days'
  ORDER BY COALESCE(p.trending_score, 0) DESC, p.created_at DESC
  OFFSET p_page * p_page_size
  LIMIT p_page_size;
END;
$$;

-- Backfill trending scores for existing posts
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.posts WHERE created_at > now() - interval '30 days'
  LOOP
    PERFORM public.update_post_trending_score(r.id);
  END LOOP;
END;
$$;
