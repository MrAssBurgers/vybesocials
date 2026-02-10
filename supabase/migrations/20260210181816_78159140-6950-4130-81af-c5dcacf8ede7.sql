
-- Fix: Sponsor profiles expose contact_email to all users
-- 1. Restrict direct SELECT to owner/admin only
DROP POLICY IF EXISTS "Sponsor profiles are viewable by all" ON public.sponsor_profiles;

CREATE POLICY "Sponsor owners can view their own profile"
ON public.sponsor_profiles FOR SELECT
USING (
  auth.uid() = (SELECT p.user_id FROM profiles p WHERE p.id = sponsor_profiles.user_id)
  OR public.has_role(auth.uid(), 'admin')
);

-- 2. Create a public view excluding contact_email
CREATE OR REPLACE VIEW public.public_sponsor_profiles
WITH (security_invoker = on) AS
SELECT id, user_id, company_name, company_logo, website_url, description,
       is_verified, verification_date, created_at, updated_at
FROM public.sponsor_profiles;
