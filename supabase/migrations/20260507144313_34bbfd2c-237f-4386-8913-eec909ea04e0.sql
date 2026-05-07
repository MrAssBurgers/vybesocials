DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    GRANT EXECUTE ON FUNCTION public.email_queue_publish_diagnostic() TO sandbox_exec;
  END IF;
END $$;