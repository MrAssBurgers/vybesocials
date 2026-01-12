-- Add room tracking columns to calls table
ALTER TABLE public.calls 
ADD COLUMN IF NOT EXISTS room_url text,
ADD COLUMN IF NOT EXISTS room_name text;

-- Create index for faster room lookups
CREATE INDEX IF NOT EXISTS idx_calls_room_name ON public.calls(room_name);
CREATE INDEX IF NOT EXISTS idx_calls_conversation_status ON public.calls(conversation_id, status);