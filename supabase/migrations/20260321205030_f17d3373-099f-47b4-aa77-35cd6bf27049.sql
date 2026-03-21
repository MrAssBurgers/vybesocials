
CREATE TABLE public.moderator_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  experience TEXT,
  availability TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.moderator_applications ENABLE ROW LEVEL SECURITY;

-- Users can view their own applications
CREATE POLICY "Users can view own applications"
  ON public.moderator_applications FOR SELECT
  TO authenticated
  USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1));

-- Users can insert their own applications
CREATE POLICY "Users can submit applications"
  ON public.moderator_applications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1));

-- Admins can view all applications
CREATE POLICY "Admins can view all applications"
  ON public.moderator_applications FOR SELECT
  TO authenticated
  USING (public.has_role((SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)::uuid, 'admin'::app_role));

-- Admins can update applications
CREATE POLICY "Admins can update applications"
  ON public.moderator_applications FOR UPDATE
  TO authenticated
  USING (public.has_role((SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)::uuid, 'admin'::app_role));
