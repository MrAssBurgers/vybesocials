-- Fix: user_levels needs INSERT policy for authenticated users
CREATE POLICY "Users can insert their own level"
ON public.user_levels FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Fix: user_levels needs UPDATE policy for authenticated users  
CREATE POLICY "Users can update their own level"
ON public.user_levels FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);