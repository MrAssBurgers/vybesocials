
-- Add safety columns to comments for AI scan results
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS safety_score NUMERIC DEFAULT 0;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS safety_categories TEXT[] DEFAULT '{}';
