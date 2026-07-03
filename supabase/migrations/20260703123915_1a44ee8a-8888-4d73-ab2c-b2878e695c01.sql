DROP POLICY IF EXISTS "Friends can view shared locations" ON public.user_locations;

CREATE POLICY "Friends can view shared locations"
ON public.user_locations
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT p.id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
  )
  OR (
    sharing_enabled = true
    AND EXISTS (
      SELECT 1
      FROM public.profiles viewer_profile
      JOIN public.friend_requests fr
        ON fr.status = 'accepted'
       AND (
         (fr.sender_id = viewer_profile.id AND fr.receiver_id = user_locations.user_id)
         OR (fr.receiver_id = viewer_profile.id AND fr.sender_id = user_locations.user_id)
       )
      WHERE viewer_profile.user_id = auth.uid()
    )
  )
);