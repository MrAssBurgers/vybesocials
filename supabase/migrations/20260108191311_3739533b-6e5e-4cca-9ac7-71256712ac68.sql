-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (user_id = public.current_profile_id());

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(public.current_profile_id(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
USING (public.has_role(public.current_profile_id(), 'admin'));

-- Create content_flags table for AI moderation results
CREATE TABLE public.content_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type TEXT NOT NULL, -- 'post', 'comment', 'message', 'profile'
    content_id UUID NOT NULL,
    flagged_text TEXT,
    ai_score DECIMAL(3,2), -- 0.00 to 1.00 toxicity score
    ai_categories JSONB, -- categories detected by AI
    status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    reviewed_by UUID REFERENCES public.profiles(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on content_flags
ALTER TABLE public.content_flags ENABLE ROW LEVEL SECURITY;

-- Only admins/moderators can view and manage content flags
CREATE POLICY "Admins can view all flags"
ON public.content_flags
FOR SELECT
USING (
    public.has_role(public.current_profile_id(), 'admin') OR 
    public.has_role(public.current_profile_id(), 'moderator')
);

CREATE POLICY "Admins can update flags"
ON public.content_flags
FOR UPDATE
USING (
    public.has_role(public.current_profile_id(), 'admin') OR 
    public.has_role(public.current_profile_id(), 'moderator')
);

-- Service role can insert flags (from edge function)
CREATE POLICY "Service can insert flags"
ON public.content_flags
FOR INSERT
WITH CHECK (true);

-- Update reports table with moderation fields
ALTER TABLE public.reports 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Admins can view all reports
CREATE POLICY "Admins can view all reports"
ON public.reports
FOR SELECT
USING (
    public.has_role(public.current_profile_id(), 'admin') OR 
    public.has_role(public.current_profile_id(), 'moderator')
);

-- Admins can update reports
CREATE POLICY "Admins can update reports"
ON public.reports
FOR UPDATE
USING (
    public.has_role(public.current_profile_id(), 'admin') OR 
    public.has_role(public.current_profile_id(), 'moderator')
);