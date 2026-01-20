-- Fix the circular RLS policy issue on conversation_members
-- The current policy uses is_member_of_conversation() which queries the same table, creating a circular dependency

-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view members of their conversations" ON public.conversation_members;

-- Create a simpler policy that directly checks ownership
CREATE POLICY "Users can view members of their conversations" 
ON public.conversation_members 
FOR SELECT 
USING (
  -- Users can view all members of conversations they are a part of
  user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  OR
  conversation_id IN (
    SELECT cm.conversation_id 
    FROM public.conversation_members cm
    INNER JOIN public.profiles p ON p.id = cm.user_id
    WHERE p.user_id = auth.uid()
  )
);

-- Also fix group_members SELECT policy that has similar issue
DROP POLICY IF EXISTS "Members can view their group's members" ON public.group_members;

CREATE POLICY "Members can view their group's members" 
ON public.group_members 
FOR SELECT 
USING (
  -- Users can see their own membership
  user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  OR
  -- Users can see other members of groups they belong to
  conversation_id IN (
    SELECT gm.conversation_id 
    FROM public.group_members gm
    INNER JOIN public.profiles p ON p.id = gm.user_id
    WHERE p.user_id = auth.uid()
  )
);