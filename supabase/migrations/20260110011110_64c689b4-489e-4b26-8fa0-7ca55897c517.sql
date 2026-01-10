-- Add unique constraint for push_tokens upsert
ALTER TABLE public.push_tokens 
ADD CONSTRAINT push_tokens_user_platform_unique UNIQUE (user_id, platform);

-- Ensure RLS is enabled
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies for push_tokens
DROP POLICY IF EXISTS "Users can manage their own push tokens" ON public.push_tokens;
CREATE POLICY "Users can manage their own push tokens"
ON public.push_tokens
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);