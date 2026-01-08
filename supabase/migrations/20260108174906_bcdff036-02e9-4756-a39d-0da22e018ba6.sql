-- Drop and recreate the INSERT policy for conversation_members
DROP POLICY IF EXISTS "Users can add members to their conversations" ON public.conversation_members;

-- Simpler policy: allow adding yourself, or adding to a conversation you created
CREATE POLICY "Users can add members to their conversations"
ON public.conversation_members
FOR INSERT
WITH CHECK (
  -- The user being added is the current user
  (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  OR
  -- The conversation was created by the current user (checked via conversations table)
  EXISTS (
    SELECT 1 FROM conversations c 
    WHERE c.id = conversation_id 
    AND c.created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
);