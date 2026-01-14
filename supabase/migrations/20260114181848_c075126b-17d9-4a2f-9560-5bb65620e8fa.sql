-- Enable realtime for user_bans table so ban/unban updates are instant
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_bans;