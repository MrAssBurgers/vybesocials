-- 1) Remove broad read access to birthdate PII on profiles
REVOKE SELECT (date_of_birth) ON public.profiles FROM authenticated;
REVOKE SELECT (date_of_birth) ON public.profiles FROM anon;

-- 2) Only the account owner may file a deletion request for themselves
DROP POLICY IF EXISTS "Anyone can submit a deletion request" ON public.account_deletion_requests;

CREATE POLICY "Users can submit their own deletion request"
ON public.account_deletion_requests
FOR INSERT
TO authenticated
WITH CHECK (
  email IS NOT NULL
  AND length(email) <= 320
  AND length(COALESCE(username, '')) <= 64
  AND length(COALESCE(reason, '')) <= 2000
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND lower(p.email) = lower(account_deletion_requests.email)
  )
);

REVOKE INSERT ON public.account_deletion_requests FROM anon;