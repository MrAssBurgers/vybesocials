-- Create content appeals table for users to appeal blocked content
CREATE TABLE public.content_appeals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image', 'text', 'video')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.content_appeals ENABLE ROW LEVEL SECURITY;

-- Users can create their own appeals
CREATE POLICY "Users can create appeals"
ON public.content_appeals
FOR INSERT
WITH CHECK (auth.uid() = (SELECT user_id FROM profiles WHERE id = content_appeals.user_id));

-- Users can view their own appeals
CREATE POLICY "Users can view own appeals"
ON public.content_appeals
FOR SELECT
USING (auth.uid() = (SELECT user_id FROM profiles WHERE id = content_appeals.user_id));

-- Admins can view all appeals
CREATE POLICY "Admins can view all appeals"
ON public.content_appeals
FOR SELECT
USING (public.has_role((SELECT id FROM profiles WHERE user_id = auth.uid()), 'admin'));

-- Admins can update appeals
CREATE POLICY "Admins can update appeals"
ON public.content_appeals
FOR UPDATE
USING (public.has_role((SELECT id FROM profiles WHERE user_id = auth.uid()), 'admin'));

-- Add is_sensitive flag to posts for warned content
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN DEFAULT false;

-- Add DND mode to notification preferences
ALTER TABLE public.notification_preferences 
ADD COLUMN IF NOT EXISTS dnd_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS dnd_until TIMESTAMP WITH TIME ZONE;