
-- Add conversation_admins table for group chat admin controls
CREATE TABLE public.conversation_admins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

ALTER TABLE public.conversation_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Conversation members can view admins"
ON public.conversation_admins
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = conversation_admins.conversation_id
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Admins can insert admins"
ON public.conversation_admins
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversation_admins ca
    WHERE ca.conversation_id = conversation_admins.conversation_id
    AND ca.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_admins.conversation_id
    AND c.created_by = auth.uid()
  )
);

CREATE POLICY "Admins can delete admins"
ON public.conversation_admins
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_admins ca
    WHERE ca.conversation_id = conversation_admins.conversation_id
    AND ca.user_id = auth.uid()
  )
);

-- Add pinned_message_id to conversations
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS pinned_message_id UUID;
