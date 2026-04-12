
-- Drop existing function first (return type changed)
DROP FUNCTION IF EXISTS public.get_friends_notes();

-- Add gif_url column to user_notes (if not already added)
ALTER TABLE public.user_notes ADD COLUMN IF NOT EXISTS gif_url TEXT;

-- Recreate get_friends_notes to include gif_url
CREATE OR REPLACE FUNCTION public.get_friends_notes()
RETURNS TABLE(id uuid, user_id uuid, content text, created_at timestamptz, expires_at timestamptz, gif_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT un.id, un.user_id, un.content, un.created_at, un.expires_at, un.gif_url
  FROM public.user_notes un
  WHERE un.expires_at > now()
    AND un.user_id IN (
      SELECT
        CASE
          WHEN fr.sender_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
            THEN (SELECT pp.user_id FROM public.profiles pp WHERE pp.id = fr.receiver_id)
          ELSE (SELECT pp.user_id FROM public.profiles pp WHERE pp.id = fr.sender_id)
        END
      FROM public.friend_requests fr
      WHERE fr.status = 'accepted'
        AND (
          fr.sender_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
          OR fr.receiver_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
        )
    );
$$;
