
-- Announcements bucket: drop permissive write policies (admin-gated ones remain)
DROP POLICY IF EXISTS "Authenticated users can upload announcement media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update announcement media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete announcement media" ON storage.objects;

-- Chat media: drop the public SELECT policy (member-gated policies remain)
DROP POLICY IF EXISTS "Chat media is publicly viewable" ON storage.objects;

-- Media bucket: drop the unscoped INSERT policy (path-owner policy remains)
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
