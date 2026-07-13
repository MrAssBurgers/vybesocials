
-- 1) post_collaborators: only post author can add collaborators, OR self-add when accepted invite exists
DROP POLICY IF EXISTS "Post owners can add collaborators" ON public.post_collaborators;

CREATE POLICY "Post owners or accepted invitees can add collaborators"
ON public.post_collaborators
FOR INSERT
TO authenticated
WITH CHECK (
  -- Case A: caller is the post's author
  EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_collaborators.post_id
      AND p.author_id = auth.uid()
  )
  OR
  -- Case B: caller is adding themself and has an accepted invite from the post author
  (
    auth.uid() = post_collaborators.user_id
    AND EXISTS (
      SELECT 1 FROM public.collab_post_invites i
      WHERE i.post_id = post_collaborators.post_id
        AND i.invitee_id = auth.uid()
        AND i.status = 'accepted'
    )
  )
);

-- 2) profiles: revoke SELECT on sensitive PII columns from anon/authenticated
REVOKE SELECT (email, phone_number, phone_verified, date_of_birth, stripe_customer_id)
  ON public.profiles FROM anon, authenticated;

-- Provide a SECURITY DEFINER accessor so a user can still read their OWN sensitive fields
CREATE OR REPLACE FUNCTION public.get_my_profile_sensitive()
RETURNS TABLE (
  email text,
  phone_number text,
  phone_verified boolean,
  date_of_birth date,
  stripe_customer_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email, p.phone_number, p.phone_verified, p.date_of_birth, p.stripe_customer_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_profile_sensitive() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile_sensitive() TO authenticated;
