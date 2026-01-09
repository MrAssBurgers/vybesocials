-- Drop and recreate the UPDATE policy with proper WITH CHECK clause
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;

CREATE POLICY "Users can update their own messages" 
ON public.messages 
FOR UPDATE 
USING (sender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
WITH CHECK (sender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));