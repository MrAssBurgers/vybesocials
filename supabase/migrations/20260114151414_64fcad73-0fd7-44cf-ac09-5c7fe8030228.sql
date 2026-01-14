-- Drop the old INSERT policy
DROP POLICY IF EXISTS "Users can trash their own conversations" ON public.trashed_conversations;

-- Create a new INSERT policy that allows users to trash conversations they are members of
CREATE POLICY "Users can trash conversations they are members of" 
ON public.trashed_conversations 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id 
  AND EXISTS (
    SELECT 1 FROM public.conversation_members 
    WHERE conversation_members.conversation_id = trashed_conversations.conversation_id 
    AND conversation_members.user_id = auth.uid()
  )
);

-- Also add UPDATE policy for upsert to work
CREATE POLICY "Users can update their own trashed conversations" 
ON public.trashed_conversations 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);