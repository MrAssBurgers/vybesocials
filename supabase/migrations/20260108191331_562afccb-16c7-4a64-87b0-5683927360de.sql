-- Drop the overly permissive insert policy
DROP POLICY IF EXISTS "Service can insert flags" ON public.content_flags;

-- The edge function will use service role key which bypasses RLS,
-- so we don't need an INSERT policy for content_flags from the app