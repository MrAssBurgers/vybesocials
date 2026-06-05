-- Remove public SELECT policy on chat-media bucket
DROP POLICY IF EXISTS "Chat media is publicly viewable" ON storage.objects;

-- Remove overpermissive authenticated write policies on announcements bucket
DROP POLICY IF EXISTS "Authenticated users can upload announcement media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update announcement media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete announcement media" ON storage.objects;