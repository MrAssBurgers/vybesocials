-- Create conversations table
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_group BOOLEAN DEFAULT false,
  name TEXT,
  avatar_url TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create conversation members table
CREATE TABLE public.conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  is_muted BOOLEAN DEFAULT false,
  is_pinned BOOLEAN DEFAULT false,
  nickname TEXT,
  last_read_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- Create messages table with view modes
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  media_url TEXT,
  media_type TEXT,
  message_type TEXT DEFAULT 'text',
  view_mode TEXT DEFAULT 'permanent', -- 'view_once', '24h', 'permanent'
  expires_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false,
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create message views table for tracking who viewed messages
CREATE TABLE public.message_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Create message reactions table
CREATE TABLE public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Create streaks table
CREATE TABLE public.streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  streak_count INTEGER DEFAULT 1,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user1_id, user2_id)
);

-- Create typing indicators table (ephemeral, for real-time)
CREATE TABLE public.typing_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- Create screenshot notifications table
CREATE TABLE public.screenshot_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screenshot_notifications ENABLE ROW LEVEL SECURITY;

-- Conversations policies
CREATE POLICY "Users can view conversations they are members of"
ON public.conversations FOR SELECT
USING (
  id IN (
    SELECT conversation_id FROM public.conversation_members
    WHERE user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Users can create conversations"
ON public.conversations FOR INSERT
WITH CHECK (
  created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Group admins can update conversations"
ON public.conversations FOR UPDATE
USING (
  id IN (
    SELECT conversation_id FROM public.conversation_members
    WHERE user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND role = 'admin'
  )
);

-- Conversation members policies
CREATE POLICY "Users can view members of their conversations"
ON public.conversation_members FOR SELECT
USING (
  conversation_id IN (
    SELECT conversation_id FROM public.conversation_members cm
    WHERE cm.user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Users can add members to conversations they admin"
ON public.conversation_members FOR INSERT
WITH CHECK (
  conversation_id IN (
    SELECT conversation_id FROM public.conversation_members
    WHERE user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND role = 'admin'
  )
  OR
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update their own membership"
ON public.conversation_members FOR UPDATE
USING (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can leave conversations"
ON public.conversation_members FOR DELETE
USING (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Messages policies
CREATE POLICY "Users can view messages in their conversations"
ON public.messages FOR SELECT
USING (
  conversation_id IN (
    SELECT conversation_id FROM public.conversation_members
    WHERE user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
  AND is_deleted = false
);

CREATE POLICY "Users can send messages to their conversations"
ON public.messages FOR INSERT
WITH CHECK (
  conversation_id IN (
    SELECT conversation_id FROM public.conversation_members
    WHERE user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
  AND sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete their own messages"
ON public.messages FOR UPDATE
USING (
  sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Message views policies
CREATE POLICY "Users can view message views in their conversations"
ON public.message_views FOR SELECT
USING (
  message_id IN (
    SELECT m.id FROM public.messages m
    JOIN public.conversation_members cm ON m.conversation_id = cm.conversation_id
    WHERE cm.user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Users can mark messages as viewed"
ON public.message_views FOR INSERT
WITH CHECK (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Message reactions policies
CREATE POLICY "Users can view reactions in their conversations"
ON public.message_reactions FOR SELECT
USING (
  message_id IN (
    SELECT m.id FROM public.messages m
    JOIN public.conversation_members cm ON m.conversation_id = cm.conversation_id
    WHERE cm.user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Users can add reactions"
ON public.message_reactions FOR INSERT
WITH CHECK (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can remove their own reactions"
ON public.message_reactions FOR DELETE
USING (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Streaks policies
CREATE POLICY "Users can view their own streaks"
ON public.streaks FOR SELECT
USING (
  user1_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR user2_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "System can manage streaks"
ON public.streaks FOR ALL
USING (
  user1_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR user2_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Typing indicators policies
CREATE POLICY "Users can view typing in their conversations"
ON public.typing_indicators FOR SELECT
USING (
  conversation_id IN (
    SELECT conversation_id FROM public.conversation_members
    WHERE user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Users can set their own typing status"
ON public.typing_indicators FOR INSERT
WITH CHECK (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can clear their own typing status"
ON public.typing_indicators FOR DELETE
USING (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Screenshot notifications policies
CREATE POLICY "Users can view screenshot notifications in their conversations"
ON public.screenshot_notifications FOR SELECT
USING (
  conversation_id IN (
    SELECT conversation_id FROM public.conversation_members
    WHERE user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Users can create screenshot notifications"
ON public.screenshot_notifications FOR INSERT
WITH CHECK (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Enable realtime for messages and typing indicators
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_views;
ALTER PUBLICATION supabase_realtime ADD TABLE public.screenshot_notifications;

-- Create indexes for performance
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX idx_conversation_members_user_id ON public.conversation_members(user_id);
CREATE INDEX idx_conversation_members_conversation_id ON public.conversation_members(conversation_id);
CREATE INDEX idx_streaks_users ON public.streaks(user1_id, user2_id);
CREATE INDEX idx_typing_indicators_conversation ON public.typing_indicators(conversation_id);