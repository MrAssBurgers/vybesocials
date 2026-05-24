-- Storage hardening: enforce size limits and MIME allowlists on all buckets.
-- Prevents XSS-via-storage (uploading text/html), oversized abuse, and unexpected file types.
-- Policies are unchanged — only bucket-level upload constraints are tightened.

-- Image/avatar buckets: images only, 5MB
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
where id = 'avatars';

-- User post media (images + video), 50MB already set, lock MIME types
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
  'video/mp4','video/quicktime','video/webm'
]
where id = 'media';

-- Stories (ephemeral images + video), 50MB already set
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/quicktime','video/webm'
]
where id = 'stories';

-- Chat media (images + short video + voice), 10MB already set
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/quicktime','video/webm',
  'audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/webm'
]
where id = 'chat-media';

-- Custom user-uploaded sounds, audio only, 10MB
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['audio/mpeg','audio/mp3','audio/wav','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/webm']
where id = 'custom-sounds';

-- App/marketing screenshots (admin uploaded), images only, 10MB
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id in ('app-screenshots','marketing-screenshots');