-- Allow users to acknowledge their own warnings
CREATE POLICY "Users can acknowledge own warnings"
ON public.user_warnings
FOR UPDATE
USING (user_id = current_profile_id())
WITH CHECK (user_id = current_profile_id());