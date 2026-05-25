REVOKE SELECT (deletion_requested_at, scheduled_purge_at)
  ON public.profiles FROM authenticated;
REVOKE SELECT (deletion_requested_at, scheduled_purge_at)
  ON public.profiles FROM anon;