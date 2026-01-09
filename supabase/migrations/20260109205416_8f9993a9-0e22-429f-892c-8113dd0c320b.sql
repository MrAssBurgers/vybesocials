-- Add UPDATE policy for typing_indicators to allow upserts
CREATE POLICY "Users can update their own typing status" 
ON public.typing_indicators 
FOR UPDATE 
USING (user_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
WITH CHECK (user_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));