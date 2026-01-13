-- Add announcements_enabled column to notification_preferences
ALTER TABLE public.notification_preferences 
ADD COLUMN IF NOT EXISTS announcements_enabled boolean DEFAULT true;

-- Create chat_presence table for real-time presence tracking
CREATE TABLE IF NOT EXISTS public.chat_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- Enable RLS
ALTER TABLE public.chat_presence ENABLE ROW LEVEL SECURITY;

-- Policies: Users can manage their own presence
CREATE POLICY "Users can insert their own presence"
ON public.chat_presence FOR INSERT
TO public
WITH CHECK (
  user_id IN (
    SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own presence"
ON public.chat_presence FOR UPDATE
TO public
USING (
  user_id IN (
    SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own presence"
ON public.chat_presence FOR DELETE
TO public
USING (
  user_id IN (
    SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
);

-- Members of a conversation can see who else is present
CREATE POLICY "Conversation members can view presence"
ON public.chat_presence FOR SELECT
TO public
USING (
  conversation_id IN (
    SELECT cm.conversation_id 
    FROM public.conversation_members cm
    WHERE cm.user_id IN (
      SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  )
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_chat_presence_conversation ON public.chat_presence(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_presence_user ON public.chat_presence(user_id);

-- Enable realtime for chat_presence
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_presence;