
-- Create user_statuses table for Snapchat-style status updates
CREATE TABLE public.user_statuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT DEFAULT '😊',
  text TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_statuses ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can see statuses
CREATE POLICY "Anyone can view statuses"
ON public.user_statuses FOR SELECT
TO authenticated
USING (true);

-- Users can insert their own status
CREATE POLICY "Users can create their own status"
ON public.user_statuses FOR INSERT
TO authenticated
WITH CHECK (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Users can update their own status
CREATE POLICY "Users can update their own status"
ON public.user_statuses FOR UPDATE
TO authenticated
USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Users can delete their own status
CREATE POLICY "Users can delete their own status"
ON public.user_statuses FOR DELETE
TO authenticated
USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Enable realtime for statuses
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_statuses;
