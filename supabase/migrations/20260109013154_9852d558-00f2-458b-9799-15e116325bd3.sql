-- Create announcements table for admin/mod announcements
CREATE TABLE public.announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Everyone can read active announcements
CREATE POLICY "Anyone can view active announcements"
ON public.announcements FOR SELECT
USING (is_active = true);

-- Only admins and moderators can create/update announcements
CREATE POLICY "Admins and moderators can create announcements"
ON public.announcements FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = public.current_profile_id()
    AND ur.role IN ('admin', 'moderator')
  )
);

CREATE POLICY "Admins and moderators can update announcements"
ON public.announcements FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = public.current_profile_id()
    AND ur.role IN ('admin', 'moderator')
  )
);

-- Create dismissed_announcements table to track which users dismissed which announcements
CREATE TABLE public.dismissed_announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, announcement_id)
);

-- Enable RLS
ALTER TABLE public.dismissed_announcements ENABLE ROW LEVEL SECURITY;

-- Users can read their own dismissed announcements
CREATE POLICY "Users can view their dismissed announcements"
ON public.dismissed_announcements FOR SELECT
USING (user_id = public.current_profile_id());

-- Users can dismiss announcements for themselves
CREATE POLICY "Users can dismiss announcements"
ON public.dismissed_announcements FOR INSERT
WITH CHECK (user_id = public.current_profile_id());

-- Create index for faster lookups
CREATE INDEX idx_announcements_active ON public.announcements(is_active, created_at DESC);
CREATE INDEX idx_dismissed_announcements_user ON public.dismissed_announcements(user_id);