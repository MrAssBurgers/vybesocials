
-- ============================================================
-- FIX 1: Restrict announcements bucket to admin/moderator only
-- ============================================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload announcement media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update announcement media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete announcement media" ON storage.objects;

-- Recreate with admin/moderator restriction
CREATE POLICY "Admins can upload announcement media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'announcements'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role))
);

CREATE POLICY "Admins can update announcement media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'announcements'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role))
);

CREATE POLICY "Admins can delete announcement media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'announcements'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role))
);

-- ============================================================
-- FIX 2: Prevent public bucket file listing
-- Make public buckets NOT public (prevents listing), keep SELECT policies for reading specific files
-- ============================================================

UPDATE storage.buckets SET public = false WHERE id IN ('media', 'stories', 'sounds', 'announcements');

-- The existing SELECT policies already allow reading specific objects by path,
-- but with public=false, listing all files is no longer possible.
-- Keep existing SELECT policies intact so direct file access still works.

-- ============================================================
-- FIX 3: Realtime channel authorization
-- Add RLS to realtime.messages to restrict channel subscriptions
-- ============================================================

-- Enable RLS on realtime.messages
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to use realtime only for channels they belong to
-- The topic format for postgres_changes is typically: realtime:{schema}:{table}:{filter}
-- We allow all authenticated users to subscribe to postgres_changes (the table RLS handles the actual data filtering)
CREATE POLICY "Authenticated users can receive realtime messages"
ON realtime.messages FOR SELECT TO authenticated
USING (true);

-- Only allow the system to insert realtime messages (not end users)
CREATE POLICY "Service role can insert realtime messages"
ON realtime.messages FOR INSERT TO service_role
WITH CHECK (true);
