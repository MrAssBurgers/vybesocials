-- Add index for faster notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at 
ON public.notifications (user_id, created_at DESC);

-- Add index for unread count queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
ON public.notifications (user_id, read) 
WHERE read = false;

-- Add index for friend requests
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_pending 
ON public.friend_requests (receiver_id, status) 
WHERE status = 'pending';