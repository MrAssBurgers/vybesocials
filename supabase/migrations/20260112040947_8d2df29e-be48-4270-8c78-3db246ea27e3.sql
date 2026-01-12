-- Group chat roles enum
DO $$ BEGIN
  CREATE TYPE public.group_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add group-specific columns to conversations
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS max_members integer DEFAULT 50;

-- Create group members table with roles
CREATE TABLE IF NOT EXISTS public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role group_role NOT NULL DEFAULT 'member',
  nickname text,
  is_muted boolean DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  invited_by uuid REFERENCES public.profiles(id),
  UNIQUE(conversation_id, user_id)
);

-- Enable RLS on group_members
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for group_members
CREATE POLICY "Members can view their group's members"
ON public.group_members
FOR SELECT
USING (
  conversation_id IN (
    SELECT conversation_id FROM group_members 
    WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Group admins and owners can add members"
ON public.group_members
FOR INSERT
WITH CHECK (
  conversation_id IN (
    SELECT conversation_id FROM group_members 
    WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND role IN ('owner', 'admin')
  )
  OR 
  -- Or the user is creating a new group (they're the owner)
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Group owners and admins can update members"
ON public.group_members
FOR UPDATE
USING (
  conversation_id IN (
    SELECT conversation_id FROM group_members 
    WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND role IN ('owner', 'admin')
  )
  OR
  -- Members can update their own settings (nickname, mute)
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Members can leave, owners/admins can remove"
ON public.group_members
FOR DELETE
USING (
  -- User can remove themselves (leave)
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR
  -- Owners and admins can remove others
  conversation_id IN (
    SELECT conversation_id FROM group_members 
    WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND role IN ('owner', 'admin')
  )
);

-- Group calls table for tracking group call participants
CREATE TABLE IF NOT EXISTS public.group_call_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid REFERENCES public.calls(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  is_muted boolean DEFAULT false,
  is_video_enabled boolean DEFAULT true,
  UNIQUE(call_id, user_id)
);

-- Enable RLS on group_call_participants
ALTER TABLE public.group_call_participants ENABLE ROW LEVEL SECURITY;

-- RLS policies for group call participants
CREATE POLICY "Call participants can view other participants"
ON public.group_call_participants
FOR SELECT
USING (
  call_id IN (
    SELECT call_id FROM group_call_participants 
    WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Users can join group calls"
ON public.group_call_participants
FOR INSERT
WITH CHECK (
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Participants can update their own state"
ON public.group_call_participants
FOR UPDATE
USING (
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Participants can leave calls"
ON public.group_call_participants
FOR DELETE
USING (
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- Add is_group_call column to calls table
ALTER TABLE public.calls 
ADD COLUMN IF NOT EXISTS is_group_call boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS max_participants integer DEFAULT 8;

-- Enable realtime for group features
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_call_participants;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_group_members_conversation ON public.group_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_call_participants_call ON public.group_call_participants(call_id);