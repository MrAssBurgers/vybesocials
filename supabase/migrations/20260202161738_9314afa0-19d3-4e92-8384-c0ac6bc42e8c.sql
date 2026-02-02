-- Fix RLS infinite recursion issues by using security definer functions

-- 1. Create helper function to check if user is a group member (avoiding self-reference)
CREATE OR REPLACE FUNCTION public.is_group_member_via_profiles(conv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members gm
    JOIN profiles p ON p.id = gm.user_id
    WHERE gm.conversation_id = conv_id
    AND p.user_id = auth.uid()
  )
$$;

-- 2. Create helper function to check if user is a call participant (avoiding self-reference)
CREATE OR REPLACE FUNCTION public.is_call_participant_via_profiles(call_id_param UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_call_participants gcp
    JOIN profiles p ON p.id = gcp.user_id
    WHERE gcp.call_id = call_id_param
    AND p.user_id = auth.uid()
  )
$$;

-- 3. Create helper to check conversation membership for chat_presence
CREATE OR REPLACE FUNCTION public.is_conversation_member_for_presence(conv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_members cm
    JOIN profiles p ON p.id = cm.user_id
    WHERE cm.conversation_id = conv_id
    AND p.user_id = auth.uid()
  )
$$;

-- 4. Drop and recreate the problematic group_members SELECT policy
DROP POLICY IF EXISTS "Members can view their group's members" ON group_members;
CREATE POLICY "Members can view their group's members" ON group_members
  FOR SELECT USING (
    user_id = current_profile_id() OR
    public.is_group_member_via_profiles(conversation_id)
  );

-- 5. Drop and recreate the problematic group_call_participants SELECT policy
DROP POLICY IF EXISTS "Call participants can view other participants" ON group_call_participants;
CREATE POLICY "Call participants can view other participants" ON group_call_participants
  FOR SELECT USING (
    user_id = current_profile_id() OR
    public.is_call_participant_via_profiles(call_id)
  );

-- 6. Fix chat_presence SELECT policy to use security definer function
DROP POLICY IF EXISTS "Conversation members can view presence" ON chat_presence;
CREATE POLICY "Conversation members can view presence" ON chat_presence
  FOR SELECT USING (
    user_id = current_profile_id() OR
    public.is_conversation_member_for_presence(conversation_id)
  );

-- 7. Fix chat_presence INSERT policy to properly check membership
DROP POLICY IF EXISTS "Users can insert their own presence" ON chat_presence;
CREATE POLICY "Users can insert their own presence" ON chat_presence
  FOR INSERT
  WITH CHECK (
    user_id = current_profile_id() AND
    public.is_conversation_member_for_presence(conversation_id)
  );