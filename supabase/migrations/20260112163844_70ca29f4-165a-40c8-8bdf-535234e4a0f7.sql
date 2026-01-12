-- ============================================
-- PART A: Fix RLS for Delete/Unsend Messages
-- ============================================

-- Add missing columns to messages table if they don't exist
DO $$ BEGIN
  ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES profiles(id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Create message_deletions table for "Delete for me" functionality
CREATE TABLE IF NOT EXISTS public.message_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  deleted_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Enable RLS on message_deletions
ALTER TABLE public.message_deletions ENABLE ROW LEVEL SECURITY;

-- RLS for message_deletions
CREATE POLICY "Users can insert their own deletions"
  ON public.message_deletions FOR INSERT
  WITH CHECK (user_id = current_profile_id());

CREATE POLICY "Users can view their own deletions"
  ON public.message_deletions FOR SELECT
  USING (user_id = current_profile_id());

CREATE POLICY "Users can remove their own deletions"
  ON public.message_deletions FOR DELETE
  USING (user_id = current_profile_id());

-- ============================================
-- PART D: Discord-like Community Servers
-- ============================================

-- Create servers table
CREATE TABLE IF NOT EXISTS public.servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon_url text,
  banner_url text,
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invite_code text UNIQUE DEFAULT substring(gen_random_uuid()::text, 1, 8),
  is_public boolean DEFAULT true,
  member_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create server_members table
CREATE TABLE IF NOT EXISTS public.server_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
  nickname text,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(server_id, user_id)
);

-- Create channels table
CREATE TABLE IF NOT EXISTS public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'voice', 'announcement')),
  position integer DEFAULT 0,
  is_private boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create channel_messages table
CREATE TABLE IF NOT EXISTS public.channel_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text,
  media_url text,
  media_type text,
  is_pinned boolean DEFAULT false,
  is_deleted boolean DEFAULT false,
  deleted_at timestamp with time zone,
  is_edited boolean DEFAULT false,
  edited_at timestamp with time zone,
  reply_to_id uuid REFERENCES channel_messages(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;

-- Helper function to check server membership
CREATE OR REPLACE FUNCTION public.is_server_member(p_server_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = p_server_id AND user_id = current_profile_id()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Helper function to check server role
CREATE OR REPLACE FUNCTION public.get_server_role(p_server_id uuid)
RETURNS text AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.server_members
  WHERE server_id = p_server_id AND user_id = current_profile_id();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RLS Policies for servers
CREATE POLICY "Anyone can view public servers"
  ON public.servers FOR SELECT
  USING (is_public = true OR owner_id = current_profile_id() OR is_server_member(id));

CREATE POLICY "Authenticated users can create servers"
  ON public.servers FOR INSERT
  WITH CHECK (owner_id = current_profile_id());

CREATE POLICY "Owners can update their servers"
  ON public.servers FOR UPDATE
  USING (owner_id = current_profile_id() OR get_server_role(id) IN ('owner', 'admin'));

CREATE POLICY "Owners can delete their servers"
  ON public.servers FOR DELETE
  USING (owner_id = current_profile_id());

-- RLS Policies for server_members
CREATE POLICY "Members can view server members"
  ON public.server_members FOR SELECT
  USING (is_server_member(server_id));

CREATE POLICY "Users can join servers"
  ON public.server_members FOR INSERT
  WITH CHECK (user_id = current_profile_id() OR get_server_role(server_id) IN ('owner', 'admin', 'moderator'));

CREATE POLICY "Admins can update members"
  ON public.server_members FOR UPDATE
  USING (get_server_role(server_id) IN ('owner', 'admin'));

CREATE POLICY "Members can leave or admins can remove"
  ON public.server_members FOR DELETE
  USING (user_id = current_profile_id() OR get_server_role(server_id) IN ('owner', 'admin', 'moderator'));

-- RLS Policies for channels
CREATE POLICY "Members can view channels"
  ON public.channels FOR SELECT
  USING (is_server_member(server_id));

CREATE POLICY "Admins can create channels"
  ON public.channels FOR INSERT
  WITH CHECK (get_server_role(server_id) IN ('owner', 'admin'));

CREATE POLICY "Admins can update channels"
  ON public.channels FOR UPDATE
  USING (get_server_role(server_id) IN ('owner', 'admin'));

CREATE POLICY "Admins can delete channels"
  ON public.channels FOR DELETE
  USING (get_server_role(server_id) IN ('owner', 'admin'));

-- RLS Policies for channel_messages
CREATE POLICY "Members can view channel messages"
  ON public.channel_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM channels c
    WHERE c.id = channel_id AND is_server_member(c.server_id)
  ));

CREATE POLICY "Members can send messages"
  ON public.channel_messages FOR INSERT
  WITH CHECK (
    sender_id = current_profile_id() AND
    EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = channel_id AND is_server_member(c.server_id)
    )
  );

CREATE POLICY "Senders can update their messages"
  ON public.channel_messages FOR UPDATE
  USING (sender_id = current_profile_id());

CREATE POLICY "Senders and mods can delete messages"
  ON public.channel_messages FOR DELETE
  USING (
    sender_id = current_profile_id() OR
    EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = channel_id AND get_server_role(c.server_id) IN ('owner', 'admin', 'moderator')
    )
  );

-- Enable realtime for channel messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_messages;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_message_deletions_user ON public.message_deletions(user_id);
CREATE INDEX IF NOT EXISTS idx_message_deletions_message ON public.message_deletions(message_id);
CREATE INDEX IF NOT EXISTS idx_servers_invite_code ON public.servers(invite_code);
CREATE INDEX IF NOT EXISTS idx_server_members_server ON public.server_members(server_id);
CREATE INDEX IF NOT EXISTS idx_server_members_user ON public.server_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_server ON public.channels(server_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON public.channel_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_created ON public.channel_messages(created_at DESC);