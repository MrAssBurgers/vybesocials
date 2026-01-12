-- Create server_notifications table to track unread channel messages per user
CREATE TABLE public.server_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.channel_messages(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  read BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, message_id)
);

-- Enable RLS
ALTER TABLE public.server_notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view their own server notifications"
ON public.server_notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Users can update (mark read) their own notifications
CREATE POLICY "Users can update their own server notifications"
ON public.server_notifications
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete their own server notifications"
ON public.server_notifications
FOR DELETE
USING (auth.uid() = user_id);

-- Allow insert from authenticated users (for trigger)
CREATE POLICY "Allow insert for authenticated users"
ON public.server_notifications
FOR INSERT
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_server_notifications_user_id ON public.server_notifications(user_id);
CREATE INDEX idx_server_notifications_server_id ON public.server_notifications(server_id);
CREATE INDEX idx_server_notifications_channel_id ON public.server_notifications(channel_id);
CREATE INDEX idx_server_notifications_unread ON public.server_notifications(user_id, read) WHERE read = false;

-- Function to create notifications for all server members when a channel message is sent
CREATE OR REPLACE FUNCTION public.notify_server_members_on_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert notification for all server members except the sender
  INSERT INTO public.server_notifications (user_id, server_id, channel_id, message_id, sender_id)
  SELECT 
    sm.user_id,
    c.server_id,
    NEW.channel_id,
    NEW.id,
    NEW.sender_id
  FROM public.server_members sm
  INNER JOIN public.channels c ON c.id = NEW.channel_id
  WHERE sm.server_id = c.server_id
    AND sm.user_id != NEW.sender_id
  ON CONFLICT (user_id, message_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to notify on new channel messages
CREATE TRIGGER notify_server_members_on_channel_message
AFTER INSERT ON public.channel_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_server_members_on_message();

-- Enable realtime for server_notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_notifications;