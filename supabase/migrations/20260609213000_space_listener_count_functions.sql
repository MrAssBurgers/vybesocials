-- Fix missing space listener count RPCs.
-- useJoinSpace/useLeaveSpace have always called increment_space_listeners /
-- decrement_space_listeners, but the functions were never created, so
-- spaces.listener_count silently stayed at 0.
--
-- Implemented as a recount from space_participants (not a blind +/- 1) so
-- rejoins and missed calls can never drift the number.

CREATE OR REPLACE FUNCTION public.recount_space_listeners(p_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.space_participants
  WHERE space_id = p_space_id
    AND left_at IS NULL;

  UPDATE public.spaces
  SET listener_count = v_count,
      peak_listeners = GREATEST(peak_listeners, v_count),
      updated_at = now()
  WHERE id = p_space_id;
END;
$$;

-- Keep the names the client already calls; both recount for accuracy.
CREATE OR REPLACE FUNCTION public.increment_space_listeners(p_space_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.recount_space_listeners(p_space_id);
$$;

CREATE OR REPLACE FUNCTION public.decrement_space_listeners(p_space_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.recount_space_listeners(p_space_id);
$$;

GRANT EXECUTE ON FUNCTION public.recount_space_listeners(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_space_listeners(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_space_listeners(uuid) TO authenticated;
