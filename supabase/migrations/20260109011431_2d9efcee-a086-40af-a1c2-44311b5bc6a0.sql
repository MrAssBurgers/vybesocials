-- Add view_count column to posts table for tracking video views
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0;

-- Create index for faster queries on view_count
CREATE INDEX IF NOT EXISTS idx_posts_view_count ON public.posts(view_count DESC);

-- Create a function to increment view count
CREATE OR REPLACE FUNCTION public.increment_view_count(post_id_param uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.posts 
  SET view_count = COALESCE(view_count, 0) + 1 
  WHERE id = post_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.increment_view_count(uuid) TO authenticated;