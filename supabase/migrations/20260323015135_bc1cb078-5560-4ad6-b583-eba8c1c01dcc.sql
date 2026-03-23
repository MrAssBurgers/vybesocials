
-- Add reaction_type column to likes table with default 'like' for backward compatibility
ALTER TABLE public.likes ADD COLUMN IF NOT EXISTS reaction_type text NOT NULL DEFAULT 'like';

-- Drop existing unique constraint if any and recreate with reaction support
-- The unique constraint should be on user_id + post_id (one reaction per user per post)
-- This already exists, so no changes needed there
