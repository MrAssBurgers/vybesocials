
-- Bug reports table for gamified bug bounty system
CREATE TABLE public.bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  component_stack TEXT,
  page_url TEXT,
  user_agent TEXT,
  ai_analysis TEXT,
  ai_severity TEXT DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'pending',
  xp_awarded BOOLEAN NOT NULL DEFAULT false,
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Users can insert their own bug reports
CREATE POLICY "Users can report bugs"
ON public.bug_reports
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = reporter_id);

-- Users can view their own bug reports
CREATE POLICY "Users can view own bug reports"
ON public.bug_reports
FOR SELECT
TO authenticated
USING (auth.uid() = reporter_id);

-- Admins/owners can view all bug reports
CREATE POLICY "Admins can view all bug reports"
ON public.bug_reports
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

-- Admins/owners can update bug reports (resolve, add notes)
CREATE POLICY "Admins can update bug reports"
ON public.bug_reports
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

-- Admins/owners can delete bug reports
CREATE POLICY "Admins can delete bug reports"
ON public.bug_reports
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

-- Index for admin queries
CREATE INDEX idx_bug_reports_status ON public.bug_reports(status);
CREATE INDEX idx_bug_reports_reporter ON public.bug_reports(reporter_id);
CREATE INDEX idx_bug_reports_created ON public.bug_reports(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_bug_reports_updated_at
BEFORE UPDATE ON public.bug_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
