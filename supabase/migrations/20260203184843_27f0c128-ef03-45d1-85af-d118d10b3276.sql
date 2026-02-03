-- Add friend_requests and screenshot_notifications to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.screenshot_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;