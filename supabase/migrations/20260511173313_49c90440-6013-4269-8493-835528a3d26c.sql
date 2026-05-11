-- ============= VYBE Score (Snapscore-style) =============

-- 1. Tables
CREATE TABLE IF NOT EXISTS public.vybe_scores (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  score bigint NOT NULL DEFAULT 0,
  last_action_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vybe_score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  points int NOT NULL,
  target_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vybe_score_events_profile_action_time
  ON public.vybe_score_events (profile_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vybe_score_events_created_at
  ON public.vybe_score_events (created_at);

-- 2. RLS
ALTER TABLE public.vybe_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vybe_score_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vybe_scores_select_all" ON public.vybe_scores;
CREATE POLICY "vybe_scores_select_all" ON public.vybe_scores
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "vybe_score_events_select_own" ON public.vybe_score_events;
CREATE POLICY "vybe_score_events_select_own" ON public.vybe_score_events
  FOR SELECT TO authenticated USING (
    profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- 3. Default points table (function for easy reference)
CREATE OR REPLACE FUNCTION public._vybe_default_points(_action text)
RETURNS int
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE _action
    WHEN 'dm_send' THEN 1
    WHEN 'dm_receive' THEN 1
    WHEN 'post_video' THEN 10
    WHEN 'post_create' THEN 6
    WHEN 'story_create' THEN 3
    WHEN 'story_view_received' THEN 1
    WHEN 'reaction_received' THEN 1
    WHEN 'reaction_given' THEN 1
    WHEN 'comment_post' THEN 2
    WHEN 'comment_received' THEN 1
    WHEN 'share_sent' THEN 2
    WHEN 'share_received' THEN 3
    WHEN 'save_received' THEN 4
    WHEN 'follower_gained' THEN 5
    WHEN 'daily_login' THEN 5
    WHEN 'login_streak_bonus' THEN 2
    WHEN 'friend_added' THEN 10
    WHEN 'challenge_complete' THEN 25
    WHEN 'first_post_of_day' THEN 15
    ELSE 1
  END;
$$;

-- 4. Core award function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.award_vybe_points(
  _profile_id uuid,
  _action text,
  _points int DEFAULT NULL,
  _target_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pts int;
  daily_count int;
  recent_count int;
  new_score bigint;
BEGIN
  IF _profile_id IS NULL OR _action IS NULL THEN
    RETURN NULL;
  END IF;

  pts := COALESCE(_points, public._vybe_default_points(_action));
  IF pts <= 0 THEN RETURN NULL; END IF;

  -- Anti-abuse: per-action 1-minute throttle for high-frequency low-value actions
  IF _action IN ('dm_send','reaction_given','story_view_received') THEN
    SELECT count(*) INTO recent_count
      FROM public.vybe_score_events
      WHERE profile_id = _profile_id
        AND action = _action
        AND created_at > now() - interval '5 seconds';
    IF recent_count >= 3 THEN RETURN NULL; END IF;
  END IF;

  -- Daily caps
  IF _action IN ('dm_send','dm_receive') THEN
    SELECT COALESCE(sum(points),0) INTO daily_count
      FROM public.vybe_score_events
      WHERE profile_id = _profile_id AND action = _action
        AND created_at > now() - interval '1 day';
    IF daily_count >= 200 THEN RETURN NULL; END IF;
  END IF;

  IF _action IN ('reaction_given') THEN
    SELECT COALESCE(sum(points),0) INTO daily_count
      FROM public.vybe_score_events
      WHERE profile_id = _profile_id AND action = _action
        AND created_at > now() - interval '1 day';
    IF daily_count >= 100 THEN RETURN NULL; END IF;
  END IF;

  IF _action = 'story_view_received' AND _target_id IS NOT NULL THEN
    SELECT count(*) INTO daily_count
      FROM public.vybe_score_events
      WHERE profile_id = _profile_id AND action = _action AND target_id = _target_id;
    IF daily_count >= 50 THEN RETURN NULL; END IF;
  END IF;

  -- Idempotency for once-per-day actions
  IF _action IN ('daily_login','first_post_of_day') THEN
    SELECT count(*) INTO recent_count
      FROM public.vybe_score_events
      WHERE profile_id = _profile_id AND action = _action
        AND created_at > date_trunc('day', now());
    IF recent_count > 0 THEN RETURN NULL; END IF;
  END IF;

  INSERT INTO public.vybe_score_events (profile_id, action, points, target_id)
    VALUES (_profile_id, _action, pts, _target_id);

  INSERT INTO public.vybe_scores (profile_id, score, last_action_at, updated_at)
    VALUES (_profile_id, pts, now(), now())
    ON CONFLICT (profile_id) DO UPDATE
      SET score = public.vybe_scores.score + EXCLUDED.score,
          last_action_at = now(),
          updated_at = now()
    RETURNING score INTO new_score;

  RETURN new_score;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_vybe_points(uuid, text, int, uuid) TO authenticated;

-- 5. Self-award convenience wrapper for callers (resolves caller's profile)
CREATE OR REPLACE FUNCTION public.award_vybe_points_self(_action text, _target_id uuid DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
BEGIN
  SELECT id INTO pid FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF pid IS NULL THEN RETURN NULL; END IF;
  RETURN public.award_vybe_points(pid, _action, NULL, _target_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_vybe_points_self(text, uuid) TO authenticated;

-- 6. Triggers on existing tables

-- Messages: sender +1, every other recipient +1 (capped via rules)
CREATE OR REPLACE FUNCTION public.trg_vybe_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  recipient uuid;
BEGIN
  PERFORM public.award_vybe_points(NEW.sender_id, 'dm_send', NULL, NEW.id);
  FOR recipient IN
    SELECT cm.profile_id FROM public.conversation_members cm
      WHERE cm.conversation_id = NEW.conversation_id AND cm.profile_id <> NEW.sender_id
  LOOP
    PERFORM public.award_vybe_points(recipient, 'dm_receive', NULL, NEW.id);
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vybe_on_message ON public.messages;
CREATE TRIGGER trg_vybe_on_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_vybe_on_message();

-- Posts: author award (video vs other) + first-post-of-day bonus
CREATE OR REPLACE FUNCTION public.trg_vybe_on_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_video boolean := false;
  posted_today int;
BEGIN
  BEGIN
    is_video := COALESCE((NEW.media_type = 'video') OR (NEW.video_url IS NOT NULL), false);
  EXCEPTION WHEN undefined_column THEN
    is_video := false;
  END;
  PERFORM public.award_vybe_points(
    NEW.author_id,
    CASE WHEN is_video THEN 'post_video' ELSE 'post_create' END,
    NULL, NEW.id
  );
  SELECT count(*) INTO posted_today FROM public.posts
    WHERE author_id = NEW.author_id AND created_at > date_trunc('day', now()) AND id <> NEW.id;
  IF posted_today = 0 THEN
    PERFORM public.award_vybe_points(NEW.author_id, 'first_post_of_day', NULL, NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vybe_on_post ON public.posts;
CREATE TRIGGER trg_vybe_on_post AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_vybe_on_post();

-- Stories
CREATE OR REPLACE FUNCTION public.trg_vybe_on_story()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.award_vybe_points(NEW.author_id, 'story_create', NULL, NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vybe_on_story ON public.stories;
CREATE TRIGGER trg_vybe_on_story AFTER INSERT ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.trg_vybe_on_story();

-- Story views: award story author
CREATE OR REPLACE FUNCTION public.trg_vybe_on_story_view()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  author uuid;
BEGIN
  SELECT author_id INTO author FROM public.stories WHERE id = NEW.story_id;
  IF author IS NOT NULL AND author <> NEW.viewer_id THEN
    PERFORM public.award_vybe_points(author, 'story_view_received', NULL, NEW.story_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vybe_on_story_view ON public.story_views;
CREATE TRIGGER trg_vybe_on_story_view AFTER INSERT ON public.story_views
  FOR EACH ROW EXECUTE FUNCTION public.trg_vybe_on_story_view();

-- Follows: follower +0 (only target gains), target +follower_gained
CREATE OR REPLACE FUNCTION public.trg_vybe_on_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.award_vybe_points(NEW.following_id, 'follower_gained', NULL, NEW.follower_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vybe_on_follow ON public.follows;
CREATE TRIGGER trg_vybe_on_follow AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.trg_vybe_on_follow();

-- Comments: commenter + post author
CREATE OR REPLACE FUNCTION public.trg_vybe_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  post_author uuid;
BEGIN
  PERFORM public.award_vybe_points(NEW.user_id, 'comment_post', NULL, NEW.post_id);
  SELECT author_id INTO post_author FROM public.posts WHERE id = NEW.post_id;
  IF post_author IS NOT NULL AND post_author <> NEW.user_id THEN
    PERFORM public.award_vybe_points(post_author, 'comment_received', NULL, NEW.post_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vybe_on_comment ON public.comments;
CREATE TRIGGER trg_vybe_on_comment AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_vybe_on_comment();

-- 7. Backfill existing users' scores
INSERT INTO public.vybe_scores (profile_id, score, updated_at)
SELECT
  p.id,
  COALESCE(post_stats.cnt, 0) * 6
    + COALESCE(follow_stats.cnt, 0) * 5
    + COALESCE(comment_stats.cnt, 0) * 2
    + COALESCE(story_stats.cnt, 0) * 3,
  now()
FROM public.profiles p
LEFT JOIN (SELECT author_id, count(*) cnt FROM public.posts GROUP BY author_id) post_stats ON post_stats.author_id = p.id
LEFT JOIN (SELECT following_id, count(*) cnt FROM public.follows GROUP BY following_id) follow_stats ON follow_stats.following_id = p.id
LEFT JOIN (SELECT user_id, count(*) cnt FROM public.comments GROUP BY user_id) comment_stats ON comment_stats.user_id = p.id
LEFT JOIN (SELECT author_id, count(*) cnt FROM public.stories GROUP BY author_id) story_stats ON story_stats.author_id = p.id
ON CONFLICT (profile_id) DO UPDATE SET score = EXCLUDED.score, updated_at = now();

-- 8. Realtime
ALTER TABLE public.vybe_scores REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vybe_scores;