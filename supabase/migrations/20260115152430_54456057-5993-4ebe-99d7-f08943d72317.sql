-- Enable realtime for posts table to sync view counts live
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;