
-- Allow authenticated users to view profile info for users they share a conversation with
CREATE POLICY "Users can view profiles of conversation members"
ON public.profiles FOR SELECT
TO authenticated
USING (
  -- Users can always see their own profile
  auth.uid() = user_id
  OR
  -- Users can see profiles of other conversation members
  EXISTS (
    SELECT 1 FROM public.conversation_members cm1
    JOIN public.conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
    WHERE cm1.user_id = public.current_profile_id()
    AND cm2.user_id = profiles.id
  )
);

-- Also allow seeing profiles of friends
CREATE POLICY "Users can view friend profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.friend_requests fr
    WHERE fr.status = 'accepted'
    AND (
      (fr.sender_id = public.current_profile_id() AND fr.receiver_id = profiles.id)
      OR (fr.receiver_id = public.current_profile_id() AND fr.sender_id = profiles.id)
    )
  )
);

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
