
CREATE OR REPLACE FUNCTION public.cleanup_expired_trashed_conversations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Hide expired trashed conversations permanently, then remove from trash
  INSERT INTO public.hidden_conversations (user_id, conversation_id)
  SELECT p.auth_id, tc.conversation_id
  FROM public.trashed_conversations tc
  JOIN public.profiles p ON p.id = tc.user_id
  WHERE tc.auto_delete_at IS NOT NULL
    AND tc.auto_delete_at <= now()
    AND p.auth_id IS NOT NULL
  ON CONFLICT (user_id, conversation_id) DO NOTHING;

  DELETE FROM public.trashed_conversations
  WHERE auto_delete_at IS NOT NULL
    AND auto_delete_at <= now();
END;
$$;

-- Schedule daily cleanup at 03:00 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-trashed-conversations') THEN
    PERFORM cron.unschedule('cleanup-expired-trashed-conversations');
  END IF;
  PERFORM cron.schedule(
    'cleanup-expired-trashed-conversations',
    '0 3 * * *',
    $cron$SELECT public.cleanup_expired_trashed_conversations();$cron$
  );
END;
$$;
