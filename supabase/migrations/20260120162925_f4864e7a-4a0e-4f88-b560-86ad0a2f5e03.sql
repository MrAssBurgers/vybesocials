-- Fix RLS policies that incorrectly compare profile IDs with auth UIDs
-- The conversation_members and group_members tables use profile.id (NOT auth.uid())

-- Drop the broken policies
DROP POLICY IF EXISTS "Users can view profiles of conversation members" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles of follows" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles of friends" ON public.profiles;

-- Create a helper function to get current user's profile id
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- Recreate the policies using the helper function
CREATE POLICY "Users can view profiles of conversation members"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM conversation_members cm1
    JOIN conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
    WHERE cm1.user_id = current_profile_id()
      AND cm2.user_id = profiles.id
  )
  OR
  EXISTS (
    SELECT 1
    FROM group_members gm1
    JOIN group_members gm2 ON gm1.conversation_id = gm2.conversation_id
    WHERE gm1.user_id = current_profile_id()
      AND gm2.user_id = profiles.id
  )
);

CREATE POLICY "Users can view profiles of follows"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM follows f
    WHERE (f.follower_id = current_profile_id() AND f.following_id = profiles.id)
       OR (f.following_id = current_profile_id() AND f.follower_id = profiles.id)
  )
);

CREATE POLICY "Users can view profiles of friends"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM friend_requests fr
    WHERE fr.status = 'accepted'
      AND (
        (fr.sender_id = current_profile_id() AND fr.receiver_id = profiles.id)
        OR (fr.receiver_id = current_profile_id() AND fr.sender_id = profiles.id)
      )
  )
);

-- Also add a public profile view policy so users can search/discover others
CREATE POLICY "Users can view public profiles"
ON public.profiles FOR SELECT TO authenticated
USING (is_private IS NOT TRUE OR is_private IS NULL);