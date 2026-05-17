-- Realtime publication: add conversation_members + auth_challenges
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversation_members'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'auth_challenges'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.auth_challenges';
  END IF;
END $$;

-- Ensure UPDATE payloads carry the full previous row (needed by cross-device read sync)
ALTER TABLE public.conversation_members REPLICA IDENTITY FULL;
ALTER TABLE public.auth_challenges REPLICA IDENTITY FULL;