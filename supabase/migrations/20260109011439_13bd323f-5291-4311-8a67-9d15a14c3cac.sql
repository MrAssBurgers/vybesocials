-- Fix the function search path security issue
CREATE OR REPLACE FUNCTION public.increment_view_count(post_id_param uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.posts 
  SET view_count = COALESCE(view_count, 0) + 1 
  WHERE id = post_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;