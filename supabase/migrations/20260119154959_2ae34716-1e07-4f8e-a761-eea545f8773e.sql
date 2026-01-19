-- Add notified_at column to track when sender was notified of accepted request
ALTER TABLE public.friend_requests 
ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;