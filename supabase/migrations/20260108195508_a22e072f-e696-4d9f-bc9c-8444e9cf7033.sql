-- Add is_pinned column to posts table
ALTER TABLE public.posts 
ADD COLUMN is_pinned boolean DEFAULT false;

-- Create index for faster queries on pinned posts
CREATE INDEX idx_posts_pinned ON public.posts(author_id, is_pinned DESC, created_at DESC);