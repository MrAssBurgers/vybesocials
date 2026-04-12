
-- Fix 1: Remove the public SELECT policy on chat-media storage that overrides the private bucket setting
DROP POLICY IF EXISTS "Chat media is publicly viewable" ON storage.objects;

-- Fix 2: Restrict user_notes SELECT to owner only
DROP POLICY IF EXISTS "Authenticated users can view notes" ON public.user_notes;

CREATE POLICY "Users can view own notes"
  ON public.user_notes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Fix 3: Create a SECURITY DEFINER function to fetch friends' notes safely
CREATE OR REPLACE FUNCTION public.get_friends_notes()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  content text,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id, n.user_id, n.content, n.created_at, n.expires_at
  FROM user_notes n
  WHERE n.expires_at > now()
    AND EXISTS (
      SELECT 1 FROM friend_requests fr
      JOIN profiles p_me ON p_me.user_id = auth.uid()
      JOIN profiles p_friend ON p_friend.user_id = n.user_id
      WHERE fr.status = 'accepted'
        AND (
          (fr.sender_id = p_me.id AND fr.receiver_id = p_friend.id)
          OR (fr.receiver_id = p_me.id AND fr.sender_id = p_friend.id)
        )
    );
$$;
