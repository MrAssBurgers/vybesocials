
-- Revert: these buckets must stay public for getPublicUrl() to work
UPDATE storage.buckets SET public = true WHERE id IN ('media', 'stories', 'sounds', 'announcements');
