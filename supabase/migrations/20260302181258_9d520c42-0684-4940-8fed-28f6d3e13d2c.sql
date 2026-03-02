CREATE POLICY "Users can update own comments"
ON public.comments
FOR UPDATE
USING (user_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
WITH CHECK (user_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));