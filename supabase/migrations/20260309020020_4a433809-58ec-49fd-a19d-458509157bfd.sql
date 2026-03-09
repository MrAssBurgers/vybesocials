
-- ========== REACTION STREAKS ==========
-- Tracks engagement streaks between two users (mutual likes/comments/messages)
CREATE TABLE public.reaction_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_user_a_at TIMESTAMPTZ,
  last_user_b_at TIMESTAMPTZ,
  streak_started_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_a, user_b),
  CONSTRAINT ordered_pair CHECK (user_a < user_b)
);

ALTER TABLE public.reaction_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own streaks"
  ON public.reaction_streaks FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Users can insert streaks they're part of"
  ON public.reaction_streaks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Users can update their own streaks"
  ON public.reaction_streaks FOR UPDATE TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

-- Function to bump a reaction streak between two users
CREATE OR REPLACE FUNCTION public.bump_reaction_streak(p_other_user UUID)
RETURNS public.reaction_streaks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_a UUID;
  v_b UUID;
  v_row public.reaction_streaks;
  v_hours_since FLOAT;
BEGIN
  -- Ensure ordered pair
  IF v_me < p_other_user THEN
    v_a := v_me; v_b := p_other_user;
  ELSE
    v_a := p_other_user; v_b := v_me;
  END IF;

  -- Upsert the streak row
  INSERT INTO public.reaction_streaks (user_a, user_b, current_streak, longest_streak, last_interaction_at, streak_started_at)
  VALUES (v_a, v_b, 0, 0, now(), now())
  ON CONFLICT (user_a, user_b) DO NOTHING;

  -- Lock and fetch
  SELECT * INTO v_row FROM public.reaction_streaks
  WHERE user_a = v_a AND user_b = v_b FOR UPDATE;

  v_hours_since := EXTRACT(EPOCH FROM (now() - v_row.last_interaction_at)) / 3600.0;

  -- Update the last interaction timestamp for the acting user
  IF v_me = v_a THEN
    v_row.last_user_a_at := now();
  ELSE
    v_row.last_user_b_at := now();
  END IF;

  -- Check if both users have interacted within 48h window
  IF v_row.last_user_a_at IS NOT NULL 
     AND v_row.last_user_b_at IS NOT NULL
     AND (now() - LEAST(v_row.last_user_a_at, v_row.last_user_b_at)) < INTERVAL '48 hours'
  THEN
    -- If streak was broken (>48h gap), restart
    IF v_hours_since > 48 THEN
      v_row.current_streak := 1;
      v_row.streak_started_at := now();
    ELSE
      v_row.current_streak := v_row.current_streak + 1;
    END IF;
    
    -- Reset the individual timestamps so next day requires fresh interaction
    v_row.last_user_a_at := NULL;
    v_row.last_user_b_at := NULL;
  END IF;

  IF v_row.current_streak > v_row.longest_streak THEN
    v_row.longest_streak := v_row.current_streak;
  END IF;

  v_row.last_interaction_at := now();
  v_row.updated_at := now();

  UPDATE public.reaction_streaks SET
    current_streak = v_row.current_streak,
    longest_streak = v_row.longest_streak,
    last_interaction_at = v_row.last_interaction_at,
    last_user_a_at = v_row.last_user_a_at,
    last_user_b_at = v_row.last_user_b_at,
    streak_started_at = v_row.streak_started_at,
    updated_at = v_row.updated_at
  WHERE id = v_row.id;

  RETURN v_row;
END;
$$;

-- ========== VYBE ROULETTE ==========
-- Queue for users waiting to be matched
CREATE TABLE public.roulette_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  interests TEXT[] DEFAULT '{}',
  mode TEXT NOT NULL DEFAULT 'text' CHECK (mode IN ('text', 'video', 'audio')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.roulette_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own queue entry"
  ON public.roulette_queue FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Matched pairs
CREATE TABLE public.roulette_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'text',
  shared_interests TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'reported')),
  conversation_id UUID REFERENCES public.conversations(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.roulette_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their matches"
  ON public.roulette_matches FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Users can update their matches"
  ON public.roulette_matches FOR UPDATE TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

-- Function to find a match from the queue
CREATE OR REPLACE FUNCTION public.find_roulette_match(p_mode TEXT DEFAULT 'text', p_interests TEXT[] DEFAULT '{}')
RETURNS public.roulette_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_match_user UUID;
  v_shared TEXT[];
  v_match public.roulette_matches;
  v_conv_id UUID;
BEGIN
  -- Remove self from queue if already there
  DELETE FROM public.roulette_queue WHERE user_id = v_me;

  -- Find best match: same mode, most shared interests, oldest in queue
  SELECT rq.user_id INTO v_match_user
  FROM public.roulette_queue rq
  WHERE rq.user_id != v_me
    AND rq.mode = p_mode
    -- Don't match with blocked users
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users bu
      WHERE (bu.blocker_id = v_me AND bu.blocked_id = rq.user_id)
         OR (bu.blocker_id = rq.user_id AND bu.blocked_id = v_me)
    )
  ORDER BY
    COALESCE(array_length(ARRAY(SELECT unnest(rq.interests) INTERSECT SELECT unnest(p_interests)), 1), 0) DESC,
    rq.joined_at ASC
  LIMIT 1;

  IF v_match_user IS NULL THEN
    -- No match found, add self to queue
    INSERT INTO public.roulette_queue (user_id, interests, mode)
    VALUES (v_me, p_interests, p_mode)
    ON CONFLICT (user_id) DO UPDATE SET interests = p_interests, mode = p_mode, joined_at = now();
    RETURN NULL;
  END IF;

  -- Remove matched user from queue
  DELETE FROM public.roulette_queue WHERE user_id = v_match_user;

  -- Calculate shared interests
  SELECT ARRAY(SELECT unnest(p_interests) INTERSECT 
    SELECT unnest(interests) FROM public.roulette_queue WHERE user_id = v_match_user)
  INTO v_shared;

  -- Create the match
  INSERT INTO public.roulette_matches (user_a, user_b, mode, shared_interests, status)
  VALUES (
    LEAST(v_me, v_match_user),
    GREATEST(v_me, v_match_user),
    p_mode,
    COALESCE(v_shared, '{}'),
    'active'
  )
  RETURNING * INTO v_match;

  RETURN v_match;
END;
$$;

-- Enable realtime on roulette queue for live matching
ALTER PUBLICATION supabase_realtime ADD TABLE public.roulette_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.roulette_matches;
