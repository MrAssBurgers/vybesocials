-- Create snap_recipients table for tracking per-recipient viewed status
CREATE TABLE IF NOT EXISTS public.snap_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL,
  opened BOOLEAN DEFAULT false,
  opened_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, recipient_id)
);

-- Enable RLS
ALTER TABLE public.snap_recipients ENABLE ROW LEVEL SECURITY;

-- Policies for snap_recipients
CREATE POLICY "Users can view snap recipients for their conversations"
ON public.snap_recipients
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = snap_recipients.message_id
    AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own snap viewed status"
ON public.snap_recipients
FOR UPDATE
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Users can insert snap recipients"
ON public.snap_recipients
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = snap_recipients.message_id
    AND m.sender_id = auth.uid()
  )
);

-- Index for fast lookups
CREATE INDEX idx_snap_recipients_message ON public.snap_recipients(message_id);
CREATE INDEX idx_snap_recipients_recipient ON public.snap_recipients(recipient_id);

-- Enable realtime for snap_recipients
ALTER PUBLICATION supabase_realtime ADD TABLE public.snap_recipients;