-- Add safety metadata columns to messages for receiver-side blur
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS safety_score NUMERIC DEFAULT 0;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS safety_categories TEXT[] DEFAULT '{}';