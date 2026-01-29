-- Fix the increment_view_count function to use SECURITY DEFINER
-- This allows it to update view_count on any post, bypassing RLS
CREATE OR REPLACE FUNCTION public.increment_view_count(post_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.posts 
  SET view_count = COALESCE(view_count, 0) + 1 
  WHERE id = post_id_param;
END;
$$;