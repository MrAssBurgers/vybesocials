-- Fix function search paths for security
CREATE OR REPLACE FUNCTION public.get_follower_count(profile_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM public.follows WHERE following_id = profile_id;
$$ LANGUAGE SQL STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_following_count(profile_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM public.follows WHERE follower_id = profile_id;
$$ LANGUAGE SQL STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_like_count(p_post_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM public.likes WHERE post_id = p_post_id;
$$ LANGUAGE SQL STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_comment_count(p_post_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM public.comments WHERE post_id = p_post_id;
$$ LANGUAGE SQL STABLE SET search_path = public;

-- Fix overly permissive notification insert policy
DROP POLICY IF EXISTS "Anyone can create notifications" ON public.notifications;
CREATE POLICY "Authenticated users can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Create storage bucket for media uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
);

-- Storage policies for media bucket
CREATE POLICY "Anyone can view media" ON storage.objects
  FOR SELECT USING (bucket_id = 'media');

CREATE POLICY "Authenticated users can upload media" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'media' 
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can update own media" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'media' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own media" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'media' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );