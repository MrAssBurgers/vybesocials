-- Enable realtime for messages and conversations tables
-- This is the critical fix that will make DMs update instantly

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;