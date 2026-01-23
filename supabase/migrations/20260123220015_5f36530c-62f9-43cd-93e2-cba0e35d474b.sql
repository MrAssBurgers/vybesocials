-- Enable realtime for calls table so incoming calls are pushed to receivers instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;