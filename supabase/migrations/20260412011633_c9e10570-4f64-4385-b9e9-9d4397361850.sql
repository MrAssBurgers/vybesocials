
-- Create user_notes table for DM notes feature
CREATE TABLE public.user_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT unique_user_note UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all notes (friend filtering in app)
CREATE POLICY "Authenticated users can view notes"
ON public.user_notes
FOR SELECT
TO authenticated
USING (true);

-- Users can insert their own note
CREATE POLICY "Users can create their own note"
ON public.user_notes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own note
CREATE POLICY "Users can update their own note"
ON public.user_notes
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Users can delete their own note
CREATE POLICY "Users can delete their own note"
ON public.user_notes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
