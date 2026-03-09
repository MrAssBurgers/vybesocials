
-- ========== VYBE SPACES - Live Audio Rooms ==========

-- Spaces table
CREATE TABLE public.spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended')),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  max_speakers INT DEFAULT 10,
  allow_requests BOOLEAN DEFAULT true,
  is_recording BOOLEAN DEFAULT false,
  recording_url TEXT,
  listener_count INT DEFAULT 0,
  peak_listeners INT DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  daily_room_name TEXT,
  daily_room_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Spaces are publicly viewable"
  ON public.spaces FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can create spaces"
  ON public.spaces FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their spaces"
  ON public.spaces FOR UPDATE TO authenticated
  USING (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their spaces"
  ON public.spaces FOR DELETE TO authenticated
  USING (auth.uid() = host_id);

-- Space participants (speakers, listeners, requests)
CREATE TABLE public.space_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'listener' CHECK (role IN ('host', 'co_host', 'speaker', 'listener', 'requested')),
  is_muted BOOLEAN DEFAULT true,
  raised_hand BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  UNIQUE (space_id, user_id)
);

ALTER TABLE public.space_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants are viewable by authenticated users"
  ON public.space_participants FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can join spaces"
  ON public.space_participants FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own participation"
  ON public.space_participants FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.spaces WHERE id = space_id AND host_id = auth.uid()
  ));

CREATE POLICY "Users can leave spaces"
  ON public.space_participants FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.spaces WHERE id = space_id AND host_id = auth.uid()
  ));

-- ========== COLLAB POSTS ==========

-- Collab post invites
CREATE TABLE public.collab_post_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE (post_id, invitee_id)
);

ALTER TABLE public.collab_post_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own invites"
  ON public.collab_post_invites FOR SELECT TO authenticated
  USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);

CREATE POLICY "Users can send invites"
  ON public.collab_post_invites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = inviter_id);

CREATE POLICY "Users can respond to invites"
  ON public.collab_post_invites FOR UPDATE TO authenticated
  USING (auth.uid() = invitee_id);

-- Collab post contributors (for posts with multiple authors)
CREATE TABLE public.post_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'contributor' CHECK (role IN ('owner', 'contributor')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

ALTER TABLE public.post_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Collaborators are publicly viewable"
  ON public.post_collaborators FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Post owners can add collaborators"
  ON public.post_collaborators FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.posts WHERE id = post_id AND user_id = auth.uid())
    OR auth.uid() = user_id
  );

CREATE POLICY "Post owners can remove collaborators"
  ON public.post_collaborators FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.posts WHERE id = post_id AND user_id = auth.uid())
    OR auth.uid() = user_id
  );

-- Enable realtime for spaces
ALTER PUBLICATION supabase_realtime ADD TABLE public.spaces;
ALTER PUBLICATION supabase_realtime ADD TABLE public.space_participants;
