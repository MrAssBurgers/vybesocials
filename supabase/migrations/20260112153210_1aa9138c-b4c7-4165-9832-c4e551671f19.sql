-- Fix conversations INSERT policy to use current_profile_id() function
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
CREATE POLICY "Users can create conversations" 
ON public.conversations 
FOR INSERT 
TO authenticated
WITH CHECK (created_by = current_profile_id());

-- Fix the infinite recursion in group_members INSERT policy
-- The issue is that the policy checks group_members to see if user is owner/admin,
-- but when creating a new group, the owner hasn't been added yet
DROP POLICY IF EXISTS "Group admins and owners can add members" ON public.group_members;
CREATE POLICY "Users can add themselves as owner to new groups" 
ON public.group_members 
FOR INSERT 
TO authenticated
WITH CHECK (
  user_id = current_profile_id() 
  OR 
  -- For adding other members, check if user is owner/admin via conversation_members table instead
  EXISTS (
    SELECT 1 FROM conversation_members cm
    WHERE cm.conversation_id = group_members.conversation_id
      AND cm.user_id = current_profile_id()
      AND cm.role IN ('owner', 'admin')
  )
);

-- Also fix the SELECT policy to avoid self-reference issues
DROP POLICY IF EXISTS "Members can view their group's members" ON public.group_members;
CREATE POLICY "Members can view their group's members" 
ON public.group_members 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM conversation_members cm
    WHERE cm.conversation_id = group_members.conversation_id
      AND cm.user_id = current_profile_id()
  )
);

-- Fix UPDATE policy 
DROP POLICY IF EXISTS "Group owners and admins can update members" ON public.group_members;
CREATE POLICY "Group owners and admins can update members" 
ON public.group_members 
FOR UPDATE 
TO authenticated
USING (
  user_id = current_profile_id()
  OR 
  EXISTS (
    SELECT 1 FROM conversation_members cm
    WHERE cm.conversation_id = group_members.conversation_id
      AND cm.user_id = current_profile_id()
      AND cm.role IN ('owner', 'admin')
  )
);

-- Fix DELETE policy
DROP POLICY IF EXISTS "Members can leave, owners/admins can remove" ON public.group_members;
CREATE POLICY "Members can leave, owners/admins can remove" 
ON public.group_members 
FOR DELETE 
TO authenticated
USING (
  user_id = current_profile_id()
  OR 
  EXISTS (
    SELECT 1 FROM conversation_members cm
    WHERE cm.conversation_id = group_members.conversation_id
      AND cm.user_id = current_profile_id()
      AND cm.role IN ('owner', 'admin')
  )
);