
-- FIX 1: Profiles
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP FUNCTION IF EXISTS public.get_public_profile_by_id(uuid);

CREATE OR REPLACE FUNCTION public.get_public_profile_by_id(target_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  is_verified boolean,
  is_premium boolean,
  equipped_name_color text,
  equipped_badge_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.user_id, p.username, p.display_name, p.avatar_url, p.bio,
         p.is_verified, p.is_premium, p.equipped_name_color,
         p.equipped_badge_id
  FROM profiles p
  WHERE p.id = target_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profile_by_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile_by_id(uuid) TO anon;

DROP POLICY IF EXISTS "Anon can view public profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anonymous users can view public profiles via view" ON public.profiles;
CREATE POLICY "Anon users cannot read profiles directly"
  ON public.profiles FOR SELECT
  TO anon
  USING (false);

-- FIX 2: Payment methods
DROP POLICY IF EXISTS "Users can view enabled payment methods of sellers" ON public.payment_methods;

CREATE POLICY "Buyers can view seller payment methods for active orders"
  ON public.payment_methods FOR SELECT
  TO authenticated
  USING (
    is_enabled = true
    AND EXISTS (
      SELECT 1 FROM public.business_orders bo
      JOIN public.business_profiles bp ON bp.id = bo.business_id
      WHERE bp.owner_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = payment_methods.user_id LIMIT 1)
        AND bo.customer_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
        AND bo.status NOT IN ('cancelled', 'refunded')
    )
  );
