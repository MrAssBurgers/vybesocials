-- Drop the existing update policy
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;

-- Create policy for senders to update their own messages (edit, unsend)
CREATE POLICY "Senders can update their own messages"
ON public.messages
FOR UPDATE
USING (
  sender_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  sender_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  )
);

-- Create policy for conversation members to update deleted_for_users (delete for me)
CREATE POLICY "Members can delete messages for themselves"
ON public.messages
FOR UPDATE
USING (
  conversation_id IN (
    SELECT conversation_id FROM conversation_members 
    WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
)
WITH CHECK (
  conversation_id IN (
    SELECT conversation_id FROM conversation_members 
    WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
);