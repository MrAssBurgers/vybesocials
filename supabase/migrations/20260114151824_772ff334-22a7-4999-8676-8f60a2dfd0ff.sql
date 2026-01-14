-- Fix RLS for trashed_conversations: this table stores profiles.id, not auth.users.id

-- Drop old policies
DROP POLICY IF EXISTS "Users can view their own trashed conversations" ON public.trashed_conversations;
DROP POLICY IF EXISTS "Users can trash conversations they are members of" ON public.trashed_conversations;
DROP POLICY IF EXISTS "Users can update their own trashed conversations" ON public.trashed_conversations;
DROP POLICY IF EXISTS "Users can restore/delete their own trashed conversations" ON public.trashed_conversations;

-- Recreate policies using current_profile_id() mapping (auth.uid() -> profiles.id)
CREATE POLICY "Users can view their own trashed conversations"
ON public.trashed_conversations
FOR SELECT
USING (user_id = current_profile_id());

CREATE POLICY "Users can trash conversations they are members of"
ON public.trashed_conversations
FOR INSERT
WITH CHECK (
  user_id = current_profile_id()
  AND EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = trashed_conversations.conversation_id
      AND cm.user_id = current_profile_id()
  )
);

CREATE POLICY "Users can update their own trashed conversations"
ON public.trashed_conversations
FOR UPDATE
USING (user_id = current_profile_id())
WITH CHECK (user_id = current_profile_id());

CREATE POLICY "Users can restore/delete their own trashed conversations"
ON public.trashed_conversations
FOR DELETE
USING (user_id = current_profile_id());

-- Fix linter: make public_profiles a security-invoker view (prevents definer-rights behavior)
ALTER VIEW public.public_profiles SET (security_invoker = true);