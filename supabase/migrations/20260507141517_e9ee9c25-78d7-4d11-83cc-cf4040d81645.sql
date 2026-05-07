CREATE OR REPLACE FUNCTION public.read_email_batch(
  queue_name text,
  batch_size integer,
  vt integer
)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq, extensions
AS $$
BEGIN
  IF queue_name NOT IN ('auth_emails', 'transactional_emails') THEN
    RAISE EXCEPTION 'invalid queue name: %', queue_name;
  END IF;

  BEGIN
    RETURN QUERY
    SELECT q.msg_id, q.read_ct, q.message
    FROM pgmq.read(queue_name, vt, batch_size) q;
  EXCEPTION
    WHEN undefined_table OR undefined_function OR undefined_object OR invalid_schema_name THEN
      RAISE NOTICE 'read_email_batch: queue % unavailable, returning empty', queue_name;
      RETURN;
    WHEN OTHERS THEN
      RAISE NOTICE 'read_email_batch: error (%) on queue %, returning empty', SQLERRM, queue_name;
      RETURN;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;