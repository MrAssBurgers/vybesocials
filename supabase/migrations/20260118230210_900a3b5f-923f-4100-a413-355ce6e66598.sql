-- Keep servers.member_count accurate based on server_members

-- 1) Trigger function
CREATE OR REPLACE FUNCTION public.tg_update_server_member_count()
RETURNS TRIGGER AS $$
DECLARE
  sid_new uuid;
  sid_old uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    sid_new := NEW.server_id;
    UPDATE public.servers
    SET member_count = (
      SELECT count(*)::int FROM public.server_members WHERE server_id = sid_new
    )
    WHERE id = sid_new;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    sid_old := OLD.server_id;
    UPDATE public.servers
    SET member_count = (
      SELECT count(*)::int FROM public.server_members WHERE server_id = sid_old
    )
    WHERE id = sid_old;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    sid_new := NEW.server_id;
    sid_old := OLD.server_id;

    -- If membership moved servers, recompute both
    IF sid_new IS DISTINCT FROM sid_old THEN
      UPDATE public.servers
      SET member_count = (
        SELECT count(*)::int FROM public.server_members WHERE server_id = sid_old
      )
      WHERE id = sid_old;
    END IF;

    UPDATE public.servers
    SET member_count = (
      SELECT count(*)::int FROM public.server_members WHERE server_id = sid_new
    )
    WHERE id = sid_new;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 2) Trigger (idempotent)
DROP TRIGGER IF EXISTS update_server_member_count ON public.server_members;
CREATE TRIGGER update_server_member_count
AFTER INSERT OR UPDATE OR DELETE ON public.server_members
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_server_member_count();

-- 3) Backfill existing servers
UPDATE public.servers s
SET member_count = COALESCE(x.cnt, 0)
FROM (
  SELECT server_id, count(*)::int AS cnt
  FROM public.server_members
  GROUP BY server_id
) x
WHERE s.id = x.server_id;

UPDATE public.servers
SET member_count = 0
WHERE id NOT IN (SELECT DISTINCT server_id FROM public.server_members);
