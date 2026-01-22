-- Fix infinite recursion in conversation_members RLS policies
-- The SELECT policy has a self-referential query that causes infinite recursion

-- First, drop the problematic policies
DROP POLICY IF EXISTS "Users can view members of their conversations" ON public.conversation_members;
DROP POLICY IF EXISTS "Creators can add members" ON public.conversation_members;
DROP POLICY IF EXISTS "Users can add members to their conversations" ON public.conversation_members;

-- Create a simpler SELECT policy that doesn't self-reference
-- Users can view members if they are a member of the same conversation
-- We use a function to check membership to avoid recursion
CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_members 
    WHERE conversation_id = conv_id 
    AND user_id = current_profile_id()
  )
$$;

-- New SELECT policy - uses the SECURITY DEFINER function to avoid RLS recursion
CREATE POLICY "Members can view conversation members"
ON public.conversation_members
FOR SELECT
USING (
  user_id = current_profile_id() 
  OR public.is_conversation_member(conversation_id)
);

-- Simplified INSERT policy for adding members
CREATE POLICY "Users can add conversation members"
ON public.conversation_members
FOR INSERT
WITH CHECK (
  -- Can always add themselves
  user_id = current_profile_id()
  OR 
  -- Or if they created the conversation
  EXISTS (
    SELECT 1 FROM conversations 
    WHERE id = conversation_id 
    AND created_by = current_profile_id()
  )
  OR
  -- Or if they're already a member (for adding others to group)
  public.is_conversation_member(conversation_id)
);