-- Add deleted_for_users column for "Delete for me" functionality
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS deleted_for_users uuid[] DEFAULT '{}';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_messages_deleted_for_users ON public.messages USING GIN(deleted_for_users);

-- Add edited_at column for message editing
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone DEFAULT NULL;

-- Add is_edited helper column
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_edited boolean DEFAULT false;

-- Create user_interactions table for feed personalization signals
CREATE TABLE IF NOT EXISTS public.user_interactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  interaction_type text NOT NULL CHECK (interaction_type IN ('view', 'like', 'comment', 'share', 'save', 'not_interested', 'watch_time')),
  duration_seconds integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id, interaction_type)
);

-- Enable RLS on user_interactions
ALTER TABLE public.user_interactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_interactions
CREATE POLICY "Users can view their own interactions"
ON public.user_interactions
FOR SELECT
USING (user_id = public.current_profile_id());

CREATE POLICY "Users can create their own interactions"
ON public.user_interactions
FOR INSERT
WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY "Users can update their own interactions"
ON public.user_interactions
FOR UPDATE
USING (user_id = public.current_profile_id());

CREATE POLICY "Users can delete their own interactions"
ON public.user_interactions
FOR DELETE
USING (user_id = public.current_profile_id());

-- Create index for faster personalized feed queries
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_post ON public.user_interactions(user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_type ON public.user_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_user_interactions_created ON public.user_interactions(created_at DESC);

-- Update the messages SELECT policy to also filter by deleted_for_users
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;

CREATE POLICY "Users can view messages in their conversations"
ON public.messages
FOR SELECT
USING (
  conversation_id IN (
    SELECT conversation_id FROM conversation_members 
    WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
  AND (is_deleted = false OR is_deleted IS NULL)
  AND NOT (deleted_for_users @> ARRAY[(SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)])
);

-- Enable realtime for user_interactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_interactions;