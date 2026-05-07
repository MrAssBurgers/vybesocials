DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'pgmq') THEN
    BEGIN
      PERFORM pgmq.create('auth_emails');
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN
      NULL;
    WHEN OTHERS THEN
      RAISE NOTICE 'auth_emails queue create skipped: %', SQLERRM;
    END;

    BEGIN
      PERFORM pgmq.create('transactional_emails');
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN
      NULL;
    WHEN OTHERS THEN
      RAISE NOTICE 'transactional_emails queue create skipped: %', SQLERRM;
    END;
  END IF;
END $$;

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
    RAISE NOTICE 'read_email_batch: invalid queue %, returning empty', queue_name;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'pgmq') THEN
    RAISE NOTICE 'read_email_batch: pgmq schema unavailable, returning empty';
    RETURN;
  END IF;

  BEGIN
    RETURN QUERY
    SELECT q.msg_id, q.read_ct, q.message
    FROM pgmq.read(queue_name, vt, batch_size) q;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'read_email_batch: queue % unavailable (%), returning empty', queue_name, SQLERRM;
    RETURN;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq, extensions
AS $$
DECLARE
  new_id bigint;
BEGIN
  IF queue_name NOT IN ('auth_emails', 'transactional_emails') THEN
    RAISE EXCEPTION 'invalid email queue name: %', queue_name;
  END IF;

  BEGIN
    SELECT pgmq.send(queue_name, payload) INTO new_id;
    RETURN new_id;
  EXCEPTION WHEN undefined_table OR invalid_schema_name OR undefined_function THEN
    BEGIN
      PERFORM pgmq.create(queue_name);
      SELECT pgmq.send(queue_name, payload) INTO new_id;
      RETURN new_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'email queue unavailable';
    END;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq, extensions
AS $$
BEGIN
  IF queue_name NOT IN ('auth_emails', 'transactional_emails') THEN
    RETURN false;
  END IF;

  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'delete_email: queue % unavailable (%), returning false', queue_name, SQLERRM;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue text,
  dlq_name text,
  message_id bigint,
  payload jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq, extensions
AS $$
DECLARE
  new_id bigint;
BEGIN
  IF source_queue NOT IN ('auth_emails', 'transactional_emails') THEN
    RETURN NULL;
  END IF;

  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'move_to_dlq: queue % unavailable (%), returning null', source_queue, SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;