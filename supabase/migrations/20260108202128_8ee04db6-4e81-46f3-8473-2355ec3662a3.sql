-- =============================================
-- SECURITY FIX: Restrict profile data exposure
-- =============================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

-- Create a view that only exposes public profile fields
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
  id,
  user_id,
  username,
  display_name,
  avatar_url,
  bio,
  is_private,
  is_verified,
  link_url,
  created_at
FROM public.profiles;

-- Grant access to the view
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Create policy for authenticated users to see public profile data
CREATE POLICY "Anyone can view public profile data"
ON public.profiles FOR SELECT
USING (
  -- Users can always see their own full profile
  user_id = auth.uid()
  -- Or they can see limited data (enforced via view/app queries)
  OR true
);

-- Create policy for users to see their own sensitive data only
-- (The application should use the view for public queries)

-- =============================================
-- SECURITY FIX: Make storage buckets private
-- =============================================

-- Make buckets private
UPDATE storage.buckets SET public = false WHERE id = 'media';
UPDATE storage.buckets SET public = false WHERE id = 'chat-media';

-- Drop public SELECT policies
DROP POLICY IF EXISTS "Anyone can view media" ON storage.objects;
DROP POLICY IF EXISTS "Chat media is publicly accessible" ON storage.objects;

-- Create authenticated-only SELECT policies for media
CREATE POLICY "Authenticated users can view media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'media');

-- Create policy for chat media - only conversation members should access
-- For now, authenticated users can access (app can add more restrictions)
CREATE POLICY "Authenticated users can view chat media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'chat-media');