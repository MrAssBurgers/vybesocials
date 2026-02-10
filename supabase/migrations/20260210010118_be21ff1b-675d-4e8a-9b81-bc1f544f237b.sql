
-- Create is_owner function for RLS
CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles_auth
    WHERE user_id = _user_id AND role = 'owner'
  )
$$;

-- Update stripe_config policies to owner-only
DROP POLICY IF EXISTS "Admins can view stripe config" ON public.stripe_config;
DROP POLICY IF EXISTS "Admins can insert stripe config" ON public.stripe_config;
DROP POLICY IF EXISTS "Admins can update stripe config" ON public.stripe_config;

CREATE POLICY "Owner can view stripe config"
  ON public.stripe_config FOR SELECT
  TO authenticated
  USING (public.is_owner(auth.uid()));

CREATE POLICY "Owner can insert stripe config"
  ON public.stripe_config FOR INSERT
  TO authenticated
  WITH CHECK (public.is_owner(auth.uid()));

CREATE POLICY "Owner can update stripe config"
  ON public.stripe_config FOR UPDATE
  TO authenticated
  USING (public.is_owner(auth.uid()));
