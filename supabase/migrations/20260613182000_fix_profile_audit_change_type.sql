-- profile_audit.change_type is NOT NULL but trigger omitted it, breaking all profile UPDATEs
-- (onboarding_completed, avatar, etc.).

CREATE OR REPLACE FUNCTION public.profile_audit_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.profile_audit(profile_id, action, change_type, changed_by, change_at, row_data)
    VALUES (NEW.id, 'INSERT', 'INSERT', public.get_auth_uid(), now(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.profile_audit(profile_id, action, change_type, changed_by, change_at, row_data)
    VALUES (NEW.id, 'UPDATE', 'UPDATE', public.get_auth_uid(), now(), jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.profile_audit(profile_id, action, change_type, changed_by, change_at, row_data)
    VALUES (OLD.id, 'DELETE', 'DELETE', public.get_auth_uid(), now(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;
