-- Add database constraints to prevent self-relationships

-- Constraint: Prevent users from friending themselves
ALTER TABLE public.friend_requests
ADD CONSTRAINT friend_requests_no_self_request
CHECK (sender_id != receiver_id);

-- Constraint: Prevent users from following themselves
ALTER TABLE public.follows
ADD CONSTRAINT follows_no_self_follow
CHECK (follower_id != following_id);