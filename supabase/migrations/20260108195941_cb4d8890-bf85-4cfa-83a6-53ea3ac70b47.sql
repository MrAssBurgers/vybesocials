-- Allow admins and moderators to delete any post
CREATE POLICY "Admins can delete any post"
ON public.posts
FOR DELETE
USING (
  has_role(current_profile_id(), 'admin') OR 
  has_role(current_profile_id(), 'moderator')
);