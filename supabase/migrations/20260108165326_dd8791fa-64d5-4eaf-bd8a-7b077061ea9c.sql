-- Drop the overly permissive public SELECT policy on follows
DROP POLICY IF EXISTS "Follows are viewable by everyone" ON public.follows;

-- Create restricted policy: Users can see follows where they are the follower
CREATE POLICY "Users can view own outgoing follows"
ON public.follows
FOR SELECT
USING (
  follower_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  )
);

-- Create restricted policy: Users can see follows where they are being followed
CREATE POLICY "Users can view incoming follows"
ON public.follows
FOR SELECT
USING (
  following_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  )
);