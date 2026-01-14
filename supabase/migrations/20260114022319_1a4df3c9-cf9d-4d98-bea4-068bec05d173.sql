-- Create table for hidden conversations (per-user conversation visibility)
CREATE TABLE public.hidden_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  hidden_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, conversation_id)
);

-- Enable RLS
ALTER TABLE public.hidden_conversations ENABLE ROW LEVEL SECURITY;

-- Users can only see their own hidden conversations
CREATE POLICY "Users can view their own hidden conversations"
ON public.hidden_conversations
FOR SELECT
USING (auth.uid() = user_id);

-- Users can hide conversations for themselves
CREATE POLICY "Users can hide conversations"
ON public.hidden_conversations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can unhide conversations
CREATE POLICY "Users can unhide conversations"
ON public.hidden_conversations
FOR DELETE
USING (auth.uid() = user_id);

-- Add index for fast lookups
CREATE INDEX idx_hidden_conversations_user_id ON public.hidden_conversations(user_id);
CREATE INDEX idx_hidden_conversations_lookup ON public.hidden_conversations(user_id, conversation_id);