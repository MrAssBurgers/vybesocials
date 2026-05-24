
-- Remove overly permissive announcement media policies (admins-only policies already exist)
DROP POLICY IF EXISTS "Authenticated users can upload announcement media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update announcement media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete announcement media" ON storage.objects;

-- Remove public-read policy on private chat-media bucket (authenticated member-scoped policies remain)
DROP POLICY IF EXISTS "Chat media is publicly viewable" ON storage.objects;

-- Remove unscoped media-bucket insert policy (path-scoped policy "Auth users upload media" remains)
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
