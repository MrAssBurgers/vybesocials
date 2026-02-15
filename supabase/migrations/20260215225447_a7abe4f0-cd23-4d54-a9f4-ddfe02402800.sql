
-- Table to track gifted premium subscriptions from owner
CREATE TABLE public.gifted_premium (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gifted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(user_id)
);

ALTER TABLE public.gifted_premium ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can check if they have gifted premium
CREATE POLICY "Users can view their own gifted premium"
ON public.gifted_premium
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Owner can view all gifted premium records
CREATE POLICY "Owner can view all gifted premium"
ON public.gifted_premium
FOR SELECT
TO authenticated
USING (public.is_owner(auth.uid()));

-- Only owner can insert gifted premium
CREATE POLICY "Owner can gift premium"
ON public.gifted_premium
FOR INSERT
TO authenticated
WITH CHECK (public.is_owner(auth.uid()));

-- Only owner can update (revoke) gifted premium
CREATE POLICY "Owner can revoke gifted premium"
ON public.gifted_premium
FOR UPDATE
TO authenticated
USING (public.is_owner(auth.uid()));

-- Only owner can delete gifted premium
CREATE POLICY "Owner can delete gifted premium"
ON public.gifted_premium
FOR DELETE
TO authenticated
USING (public.is_owner(auth.uid()));

-- Function to check if a user has gifted premium (for use in hooks)
CREATE OR REPLACE FUNCTION public.has_gifted_premium(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gifted_premium
    WHERE user_id = p_user_id AND is_active = true AND revoked_at IS NULL
  )
$$;
