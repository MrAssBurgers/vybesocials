CREATE OR REPLACE FUNCTION public.email_queue_publish_diagnostic()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  fn text;
BEGIN
  SELECT pg_get_functiondef('public.read_email_batch(text,integer,integer)'::regprocedure) INTO fn;

  RETURN jsonb_build_object(
    'auth_queue_exists', to_regclass('pgmq.q_auth_emails') IS NOT NULL,
    'transactional_queue_exists', to_regclass('pgmq.q_transactional_emails') IS NOT NULL,
    'read_helper_has_read_only_guard', position('transaction_read_only' in fn) > 0,
    'read_helper_has_lazy_create', position('pgmq.create' in fn) > 0,
    'service_role_can_execute', has_function_privilege('service_role', 'public.read_email_batch(text,integer,integer)', 'execute'),
    'anon_can_execute', has_function_privilege('anon', 'public.read_email_batch(text,integer,integer)', 'execute'),
    'authenticated_can_execute', has_function_privilege('authenticated', 'public.read_email_batch(text,integer,integer)', 'execute')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_queue_publish_diagnostic() TO PUBLIC, anon, authenticated;