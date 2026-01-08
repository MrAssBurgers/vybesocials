-- Drop the restrictive INSERT policy for conversation_members
DROP POLICY IF EXISTS "Users can add members to conversations they admin" ON public.conversation_members;

-- Create a more permissive policy that allows adding members when you're the conversation creator
CREATE POLICY "Users can add members to their conversations"
ON public.conversation_members
FOR INSERT
WITH CHECK (
  -- User is adding themselves
  (user_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
  OR
  -- User created the conversation (is admin)
  (conversation_id IN (
    SELECT conversation_id FROM conversation_members 
    WHERE user_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
    AND role = 'admin'
  ))
  OR
  -- Conversation was just created by this user
  (conversation_id IN (
    SELECT id FROM conversations 
    WHERE created_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
  ))
);