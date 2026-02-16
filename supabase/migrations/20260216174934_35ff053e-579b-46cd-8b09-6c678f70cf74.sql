-- Allow recipients to accept their own pending premium gift
CREATE POLICY "Recipients can accept their own gift"
ON public.gifted_premium
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (user_id = auth.uid() AND status = 'accepted');