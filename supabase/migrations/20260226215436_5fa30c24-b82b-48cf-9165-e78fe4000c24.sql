-- Add UPDATE policy for message_deletions so upsert works
CREATE POLICY "Users can update their own deletions"
ON public.message_deletions
FOR UPDATE
USING (user_id = current_profile_id())
WITH CHECK (user_id = current_profile_id());