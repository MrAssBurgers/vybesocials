DROP FUNCTION IF EXISTS public.get_own_sensitive_profile();
CREATE OR REPLACE FUNCTION public.get_own_sensitive_profile()
 RETURNS TABLE(stripe_customer_id text, tracking_consent text, date_of_birth date, email text, phone_number text, phone_verified boolean, crash_consent boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.stripe_customer_id, p.tracking_consent, p.date_of_birth, p.email, p.phone_number, p.phone_verified, p.crash_consent
  FROM profiles p
  WHERE p.user_id = auth.uid();
$function$;