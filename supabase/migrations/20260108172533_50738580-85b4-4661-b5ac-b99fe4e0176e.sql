-- Create stories table
CREATE TABLE public.stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  caption TEXT,
  is_close_friends_only BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create story views table
CREATE TABLE public.story_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(story_id, viewer_id)
);

-- Create close friends table
CREATE TABLE public.close_friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

-- Create friend requests table
CREATE TABLE public.friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sender_id, receiver_id)
);

-- Enable RLS
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.close_friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

-- Stories policies
CREATE POLICY "Users can view non-expired stories from followed users or public"
ON public.stories FOR SELECT
USING (
  expires_at > now() AND (
    -- Own stories
    author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR (
      -- Not close friends only, or user is in close friends
      (NOT is_close_friends_only) 
      OR 
      EXISTS (
        SELECT 1 FROM public.close_friends cf 
        WHERE cf.user_id = stories.author_id 
        AND cf.friend_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      )
    )
  )
);

CREATE POLICY "Users can create own stories"
ON public.stories FOR INSERT
WITH CHECK (
  author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete own stories"
ON public.stories FOR DELETE
USING (
  author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Story views policies
CREATE POLICY "Story owners can see views"
ON public.story_views FOR SELECT
USING (
  story_id IN (
    SELECT id FROM public.stories 
    WHERE author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Users can mark stories as viewed"
ON public.story_views FOR INSERT
WITH CHECK (
  viewer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Close friends policies
CREATE POLICY "Users can view own close friends list"
ON public.close_friends FOR SELECT
USING (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can manage own close friends"
ON public.close_friends FOR INSERT
WITH CHECK (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can remove close friends"
ON public.close_friends FOR DELETE
USING (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Friend requests policies
CREATE POLICY "Users can view their sent and received requests"
ON public.friend_requests FOR SELECT
USING (
  sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR receiver_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can send friend requests"
ON public.friend_requests FOR INSERT
WITH CHECK (
  sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update requests they received"
ON public.friend_requests FOR UPDATE
USING (
  receiver_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete their sent requests"
ON public.friend_requests FOR DELETE
USING (
  sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR receiver_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Enable realtime for stories
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;

-- Create indexes
CREATE INDEX idx_stories_author ON public.stories(author_id);
CREATE INDEX idx_stories_expires ON public.stories(expires_at);
CREATE INDEX idx_story_views_story ON public.story_views(story_id);
CREATE INDEX idx_close_friends_user ON public.close_friends(user_id);
CREATE INDEX idx_friend_requests_receiver ON public.friend_requests(receiver_id);
CREATE INDEX idx_friend_requests_status ON public.friend_requests(status);