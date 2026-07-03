
-- Remove overly-permissive storage policies and tighten user_locations visibility.

-- Announcements bucket: remove any-authenticated write/update/delete policies.
DROP POLICY IF EXISTS "Authenticated users can upload announcement media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update announcement media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete announcement media" ON storage.objects;

-- Media bucket: remove broad upload policy that lacks a folder-ownership check.
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;

-- Sounds bucket: remove broad upload policy that lacks a folder-ownership check.
DROP POLICY IF EXISTS "Authenticated users can upload sounds" ON storage.objects;

-- Restrict user_locations reads to accepted friends (+ self) only.
DROP POLICY IF EXISTS "Anyone authenticated can view shared locations" ON public.user_locations;

CREATE POLICY "Friends can view shared locations"
ON public.user_locations
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (
    sharing_enabled = true
    AND EXISTS (
      SELECT 1 FROM public.friend_requests fr
      WHERE fr.status = 'accepted'
        AND (
          (fr.sender_id = auth.uid() AND fr.receiver_id = user_locations.user_id)
          OR (fr.receiver_id = auth.uid() AND fr.sender_id = user_locations.user_id)
        )
    )
  )
);
