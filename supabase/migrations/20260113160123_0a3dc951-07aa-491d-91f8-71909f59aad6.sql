-- Fix story_views: Add SELECT policy for viewers to see their own views
CREATE POLICY "Users can view their own story views" 
ON public.story_views 
FOR SELECT 
USING (viewer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Add SELECT policy for story_views to see if current user viewed a story
-- This is needed for the "seen" indicator

-- Update story_likes RLS to be consistent - use auth.uid() correctly
-- The current policies use auth.uid() = user_id which means user_id column should store auth user id

-- Add index for faster story views lookups
CREATE INDEX IF NOT EXISTS idx_story_views_viewer_id ON public.story_views (viewer_id);
CREATE INDEX IF NOT EXISTS idx_story_likes_user_id ON public.story_likes (user_id);