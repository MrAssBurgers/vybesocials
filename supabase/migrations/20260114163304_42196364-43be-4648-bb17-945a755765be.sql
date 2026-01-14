-- Enable pg_cron for background processing of scheduled messages
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Processes due scheduled messages by inserting them into messages and marking them as sent
CREATE OR REPLACE FUNCTION public.process_due_scheduled_messages(limit_count integer DEFAULT 200)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  processed integer := 0;
BEGIN
  WITH due AS (
    SELECT
      id,
      conversation_id,
      sender_id,
      content,
      media_url,
      media_type,
      view_mode,
      reply_to_id
    FROM public.scheduled_messages
    WHERE status = 'pending'
      AND scheduled_at <= now()
    ORDER BY scheduled_at ASC
    LIMIT limit_count
    FOR UPDATE SKIP LOCKED
  ), inserted AS (
    INSERT INTO public.messages (
      conversation_id,
      sender_id,
      content,
      media_url,
      media_type,
      view_mode,
      reply_to_id
    )
    SELECT
      conversation_id,
      sender_id,
      content,
      media_url,
      media_type,
      view_mode,
      reply_to_id
    FROM due
    RETURNING 1
  )
  UPDATE public.scheduled_messages sm
  SET
    status = 'sent',
    sent_at = now()
  FROM due
  WHERE sm.id = due.id;

  GET DIAGNOSTICS processed = ROW_COUNT;
  RETURN processed;
END;
$fn$;

-- Poll frequently so messages go out right when the minute flips
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'process_due_scheduled_messages'
  ) THEN
    PERFORM cron.schedule(
      'process_due_scheduled_messages',
      '10 seconds',
      $cmd$SELECT public.process_due_scheduled_messages();$cmd$
    );
  END IF;
END;
$do$;