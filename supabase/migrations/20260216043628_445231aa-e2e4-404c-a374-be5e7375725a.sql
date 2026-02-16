-- Add accepted_at to gifted_premium for tracking acceptance
ALTER TABLE public.gifted_premium ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- Add a status column: 'pending' | 'accepted'
ALTER TABLE public.gifted_premium ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- Update existing active gifts to 'accepted' status
UPDATE public.gifted_premium SET status = 'accepted', accepted_at = created_at WHERE is_active = true;
