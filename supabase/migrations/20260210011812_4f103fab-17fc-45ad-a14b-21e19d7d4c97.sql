
-- Table to store app secrets (owner-managed from UI)
CREATE TABLE public.app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- Only owner can read/write
CREATE POLICY "Owner can view secrets"
  ON public.app_secrets FOR SELECT
  TO authenticated
  USING (public.is_owner(auth.uid()));

CREATE POLICY "Owner can insert secrets"
  ON public.app_secrets FOR INSERT
  TO authenticated
  WITH CHECK (public.is_owner(auth.uid()));

CREATE POLICY "Owner can update secrets"
  ON public.app_secrets FOR UPDATE
  TO authenticated
  USING (public.is_owner(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_app_secrets_updated_at
  BEFORE UPDATE ON public.app_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
