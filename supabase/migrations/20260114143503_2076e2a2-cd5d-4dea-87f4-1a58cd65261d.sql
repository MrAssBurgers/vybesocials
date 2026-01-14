-- Create trashed_conversations table for soft-deleted chats that can be recovered
CREATE TABLE public.trashed_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  trashed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  auto_delete_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '30 days'),
  UNIQUE(user_id, conversation_id)
);

-- Enable Row Level Security
ALTER TABLE public.trashed_conversations ENABLE ROW LEVEL SECURITY;

-- Create policies - users can only manage their own trashed conversations
CREATE POLICY "Users can view their own trashed conversations"
ON public.trashed_conversations
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can trash their own conversations"
ON public.trashed_conversations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can restore/delete their own trashed conversations"
ON public.trashed_conversations
FOR DELETE
USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX idx_trashed_conversations_user ON public.trashed_conversations(user_id);
CREATE INDEX idx_trashed_conversations_auto_delete ON public.trashed_conversations(auto_delete_at);

-- Enable realtime for instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.trashed_conversations;