-- Make chat-media bucket public so images can be displayed without signed URLs
UPDATE storage.buckets SET public = true WHERE id = 'chat-media';