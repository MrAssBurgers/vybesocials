-- Add a policy to allow viewing profiles of users you share a conversation with
-- This is needed so users can see other participants' names and avatars in chats

-- First, let's add a more permissive policy for viewing profiles
-- In a social app, profiles should generally be publicly viewable
CREATE POLICY "Users can view profiles of conversation members" 
ON public.profiles 
FOR SELECT 
USING (
  -- Allow viewing profiles of users who share a conversation with you
  EXISTS (
    SELECT 1 FROM public.conversation_members cm1
    JOIN public.conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
    WHERE cm1.user_id = auth.uid() AND cm2.user_id = profiles.id
  )
  OR
  EXISTS (
    SELECT 1 FROM public.group_members gm1
    JOIN public.group_members gm2 ON gm1.conversation_id = gm2.conversation_id
    WHERE gm1.user_id = auth.uid() AND gm2.user_id = profiles.id
  )
);

-- Also allow viewing profiles of friends
CREATE POLICY "Users can view profiles of friends" 
ON public.profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.friend_requests fr
    WHERE fr.status = 'accepted'
    AND (
      (fr.sender_id = auth.uid() AND fr.receiver_id = profiles.id)
      OR (fr.receiver_id = auth.uid() AND fr.sender_id = profiles.id)
    )
  )
);

-- Allow viewing profiles of users you follow or who follow you
CREATE POLICY "Users can view profiles of follows" 
ON public.profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.follows f
    WHERE (f.follower_id = auth.uid() AND f.following_id = profiles.id)
    OR (f.following_id = auth.uid() AND f.follower_id = profiles.id)
  )
);