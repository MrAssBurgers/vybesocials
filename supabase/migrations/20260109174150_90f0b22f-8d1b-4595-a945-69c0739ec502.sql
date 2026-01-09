-- Drop the existing policy and recreate with proper with_check
DROP POLICY IF EXISTS "Users can manage own follows" ON public.follows;

-- Create separate policies for insert/update/delete with proper with_check
CREATE POLICY "Users can insert own follows"
ON public.follows
FOR INSERT
WITH CHECK (follower_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own follows"
ON public.follows
FOR DELETE
USING (follower_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));