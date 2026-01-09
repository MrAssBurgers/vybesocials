-- Add image_url column to comments for image attachments
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS image_url TEXT;