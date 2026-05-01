-- Public account deletion requests (Google Play compliance)
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  username text,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  ip_address text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_email ON public.account_deletion_requests(email);
CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_status ON public.account_deletion_requests(status);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Anyone (logged in or not) can submit a deletion request
CREATE POLICY "Anyone can submit a deletion request"
ON public.account_deletion_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (
  email IS NOT NULL
  AND length(email) <= 320
  AND length(coalesce(username, '')) <= 64
  AND length(coalesce(reason, '')) <= 2000
);

-- Only owners/admins can read deletion requests
CREATE POLICY "Owners can read deletion requests"
ON public.account_deletion_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

-- Only owners can update/process them
CREATE POLICY "Owners can update deletion requests"
ON public.account_deletion_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));