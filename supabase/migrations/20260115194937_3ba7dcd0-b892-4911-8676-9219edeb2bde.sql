
-- Create a security definer function to get mutual friends between two users
-- This bypasses RLS to check friend relationships without exposing private data
CREATE OR REPLACE FUNCTION public.get_mutual_friends(current_user_id uuid, target_user_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_url text,
  display_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return early if same user
  IF current_user_id = target_user_id THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH current_user_friends AS (
    -- Get all friends of current user
    SELECT CASE 
      WHEN fr.sender_id = current_user_id THEN fr.receiver_id
      ELSE fr.sender_id
    END as friend_id
    FROM friend_requests fr
    WHERE (fr.sender_id = current_user_id OR fr.receiver_id = current_user_id)
    AND fr.status = 'accepted'
  ),
  target_user_friends AS (
    -- Get all friends of target user
    SELECT CASE 
      WHEN fr.sender_id = target_user_id THEN fr.receiver_id
      ELSE fr.sender_id
    END as friend_id
    FROM friend_requests fr
    WHERE (fr.sender_id = target_user_id OR fr.receiver_id = target_user_id)
    AND fr.status = 'accepted'
  ),
  mutual_ids AS (
    -- Find intersection
    SELECT cuf.friend_id
    FROM current_user_friends cuf
    INNER JOIN target_user_friends tuf ON cuf.friend_id = tuf.friend_id
  )
  SELECT p.id, p.username, p.avatar_url, p.display_name
  FROM profiles p
  INNER JOIN mutual_ids m ON p.id = m.friend_id
  LIMIT 10;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_mutual_friends(uuid, uuid) TO authenticated;
