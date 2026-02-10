
-- Fix stories RLS: allow anonymous users to view public, non-close-friends stories
DROP POLICY IF EXISTS "Users can view non-expired stories from followed users or publi" ON public.stories;

CREATE POLICY "Anyone can view public non-expired stories"
ON public.stories
FOR SELECT
USING (
  expires_at > now()
  AND (
    -- Own stories (authenticated users)
    (auth.uid() IS NOT NULL AND author_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    ))
    -- Public stories (not close-friends-only) — accessible to everyone including anon
    OR (NOT is_close_friends_only)
    -- Close friends stories (authenticated users who are in close friends list)
    OR (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM close_friends cf
      WHERE cf.user_id = stories.author_id
      AND cf.friend_id IN (
        SELECT id FROM profiles WHERE user_id = auth.uid()
      )
    ))
  )
);
