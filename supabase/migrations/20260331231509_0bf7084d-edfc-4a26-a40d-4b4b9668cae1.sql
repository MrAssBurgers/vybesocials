
-- Column-level security: revoke SELECT on sensitive columns from authenticated/anon
-- Then re-grant to specific roles that need it

-- First, revoke all column-level SELECT on sensitive columns
REVOKE SELECT (stripe_customer_id, tracking_consent, date_of_birth, email, phone_number, phone_verified) 
ON public.profiles FROM authenticated;

REVOKE SELECT (stripe_customer_id, tracking_consent, date_of_birth, email, phone_number, phone_verified)
ON public.profiles FROM anon;

-- The owner can still read these via the public_profiles view (which uses auth.uid() = user_id CASE)
-- And via direct queries where eq('id', profile.id) - because the RLS policy "Users can view own profile" 
-- grants row-level access, but column-level revoke still blocks.
-- So we need a SECURITY DEFINER function for own-profile sensitive reads.

-- Create a function to read own sensitive profile data
CREATE OR REPLACE FUNCTION public.get_own_sensitive_profile()
RETURNS TABLE (
  stripe_customer_id text,
  tracking_consent text,
  date_of_birth date,
  email text,
  phone_number text,
  phone_verified boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.stripe_customer_id, p.tracking_consent, p.date_of_birth, p.email, p.phone_number, p.phone_verified
  FROM profiles p
  WHERE p.user_id = auth.uid();
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_own_sensitive_profile() TO authenticated;
