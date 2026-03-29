
-- ============================================================
-- 1. Enhance VYBE DNA: add watch_time, session, engagement columns
-- ============================================================
ALTER TABLE public.vybe_dna
  ADD COLUMN IF NOT EXISTS watch_time_avg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS session_time_avg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_hours jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS engagement_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interests text[] DEFAULT '{}';

-- ============================================================
-- 2. Upgrade compute_vybe_dna to include watch_time, engagement, interests
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_vybe_dna()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _auth_uid uuid := auth.uid();
  _profile_id uuid;
  _post_count int := 0;
  _like_count int := 0;
  _comment_count int := 0;
  _message_count int := 0;
  _interaction_count int := 0;
  _watch_time_avg numeric := 0;
  _session_time_avg numeric := 0;
  _active_hours jsonb := '[]'::jsonb;
  _engagement_score numeric := 0;
  _interests text[] := '{}';
  _activity_raw float := 0;
  _social_raw float := 0;
  _creative_raw float := 0;
  _activity float := 0;
  _social float := 0;
  _creative float := 0;
  _result jsonb;
BEGIN
  IF _auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO _profile_id
  FROM public.profiles
  WHERE user_id = _auth_uid
  LIMIT 1;

  IF _profile_id IS NULL THEN
    RETURN jsonb_build_object(
      'activity', 0, 'social', 0, 'creative', 0,
      'post_count', 0, 'like_count', 0, 'comment_count', 0,
      'message_count', 0, 'interaction_count', 0,
      'watch_time_avg', 0, 'session_time_avg', 0, 'engagement_score', 0
    );
  END IF;

  SELECT count(*) INTO _post_count FROM public.posts WHERE author_id = _profile_id;
  SELECT count(*) INTO _like_count FROM public.likes WHERE user_id = _profile_id;
  SELECT count(*) INTO _comment_count FROM public.comments WHERE user_id = _profile_id;
  SELECT count(*) INTO _message_count FROM public.messages WHERE sender_id = _profile_id;
  SELECT count(*) INTO _interaction_count FROM public.user_interactions WHERE user_id = _profile_id;

  SELECT COALESCE(AVG(duration_seconds), 0) INTO _watch_time_avg
  FROM public.user_interactions
  WHERE user_id = _profile_id
    AND interaction_type = 'watch_time'
    AND created_at > now() - interval '30 days';

  SELECT COALESCE(AVG(session_dur), 0) INTO _session_time_avg
  FROM (
    SELECT EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) AS session_dur
    FROM public.user_interactions
    WHERE user_id = _profile_id
      AND created_at > now() - interval '30 days'
    GROUP BY date_trunc('hour', created_at)
    HAVING COUNT(*) > 1
  ) sessions;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', h, 'count', c) ORDER BY c DESC), '[]'::jsonb)
  INTO _active_hours
  FROM (
    SELECT EXTRACT(HOUR FROM created_at)::int AS h, COUNT(*) AS c
    FROM public.user_interactions
    WHERE user_id = _profile_id
      AND created_at > now() - interval '30 days'
    GROUP BY h
    ORDER BY c DESC
    LIMIT 5
  ) top_hours;

  SELECT COALESCE(array_agg(tag ORDER BY cnt DESC), '{}')
  INTO _interests
  FROM (
    SELECT unnest(p.tags) AS tag, COUNT(*) AS cnt
    FROM public.user_interactions ui
    JOIN public.posts p ON p.id = ui.post_id
    WHERE ui.user_id = _profile_id
      AND ui.interaction_type IN ('like', 'save', 'share', 'watch_time')
      AND ui.created_at > now() - interval '30 days'
      AND p.tags IS NOT NULL
    GROUP BY tag
    ORDER BY cnt DESC
    LIMIT 20
  ) top_tags;

  _creative_raw := ln(greatest(_post_count, 1)::float + 1);
  _social_raw := ln(greatest(_like_count + _comment_count + _message_count, 1)::float + 1);
  _activity_raw := ln(greatest(_interaction_count, 1)::float + 1);

  _creative := (tanh((_creative_raw / 4.0) - 0.5) + 1) / 2;
  _social := (tanh((_social_raw / 5.0) - 0.5) + 1) / 2;
  _activity := (tanh((_activity_raw / 5.0) - 0.5) + 1) / 2;

  _engagement_score := LEAST(100, ROUND(
    (_activity * 25 + _social * 35 + _creative * 25 + LEAST(_watch_time_avg / 30.0, 1) * 15)::numeric
  , 2));

  INSERT INTO public.vybe_dna (user_id, personality_vector, aura_intensity, watch_time_avg, session_time_avg, active_hours, engagement_score, interests, updated_at, generated_at)
  VALUES (
    _auth_uid,
    jsonb_build_object(
      'activity', round(_activity::numeric, 4),
      'social', round(_social::numeric, 4),
      'creative', round(_creative::numeric, 4)
    ),
    round(((_activity + _social + _creative) / 3)::numeric, 4),
    round(_watch_time_avg::numeric, 2),
    round(_session_time_avg::numeric, 2),
    _active_hours,
    _engagement_score,
    _interests,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    personality_vector = EXCLUDED.personality_vector,
    aura_intensity = EXCLUDED.aura_intensity,
    watch_time_avg = EXCLUDED.watch_time_avg,
    session_time_avg = EXCLUDED.session_time_avg,
    active_hours = EXCLUDED.active_hours,
    engagement_score = EXCLUDED.engagement_score,
    interests = EXCLUDED.interests,
    updated_at = now();

  SELECT jsonb_build_object(
    'activity', round(_activity::numeric, 4),
    'social', round(_social::numeric, 4),
    'creative', round(_creative::numeric, 4),
    'post_count', _post_count,
    'like_count', _like_count,
    'comment_count', _comment_count,
    'message_count', _message_count,
    'interaction_count', _interaction_count,
    'watch_time_avg', round(_watch_time_avg::numeric, 2),
    'session_time_avg', round(_session_time_avg::numeric, 2),
    'engagement_score', _engagement_score
  ) INTO _result;

  RETURN _result;
END;
$$;

-- ============================================================
-- 3. Auto-XP triggers for engagement actions
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_grant_engagement_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _xp int;
  _source text;
  _profile_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'likes' THEN
    _xp := 5; _source := 'like'; _profile_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'comments' THEN
    _xp := 10; _source := 'comment'; _profile_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'bookmarks' THEN
    _xp := 10; _source := 'save'; _profile_id := NEW.user_id;
  ELSE
    RETURN NEW;
  END IF;

  IF (
    SELECT COUNT(*) FROM public.user_interactions
    WHERE user_id = _profile_id
      AND interaction_type = _source
      AND created_at > now() - interval '1 hour'
  ) > 50 THEN
    RETURN NEW;
  END IF;

  PERFORM public.add_user_xp(_profile_id, _xp, _source);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_like_xp ON public.likes;
DROP TRIGGER IF EXISTS trg_comment_xp ON public.comments;
DROP TRIGGER IF EXISTS trg_bookmark_xp ON public.bookmarks;

CREATE TRIGGER trg_like_xp
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.auto_grant_engagement_xp();

CREATE TRIGGER trg_comment_xp
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.auto_grant_engagement_xp();

CREATE TRIGGER trg_bookmark_xp
  AFTER INSERT ON public.bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.auto_grant_engagement_xp();

-- ============================================================
-- 4. Performance indexes for feed hot paths
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_posts_type_created
  ON public.posts (type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_author_trending
  ON public.posts (author_id, trending_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_user_interactions_user_type_recent
  ON public.user_interactions (user_id, interaction_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_interactions_post_type
  ON public.user_interactions (post_id, interaction_type);

CREATE INDEX IF NOT EXISTS idx_likes_post_user
  ON public.likes (post_id, user_id);

CREATE INDEX IF NOT EXISTS idx_comments_post_created
  ON public.comments (post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_follows_follower
  ON public.follows (follower_id, following_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vybe_dna_user
  ON public.vybe_dna (user_id);
