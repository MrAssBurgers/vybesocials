-- Fix: Restrict user_levels SELECT to authenticated users only (was public/anon)
-- Drop the overly permissive public leaderboard policy
DROP POLICY IF EXISTS "Users can view all levels for leaderboard" ON public.user_levels;

-- Create a new policy scoped to authenticated users only
CREATE POLICY "Authenticated users can view levels for leaderboard"
  ON public.user_levels
  FOR SELECT
  TO authenticated
  USING (true);
