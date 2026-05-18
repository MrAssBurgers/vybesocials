ALTER TABLE public.profiles ALTER COLUMN crash_consent DROP DEFAULT;

DO $$
DECLARE
  trig_rec RECORD;
BEGIN
  FOR trig_rec IN
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND NOT tgisinternal
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DISABLE TRIGGER %I', trig_rec.tgname);
  END LOOP;

  UPDATE public.profiles SET crash_consent = NULL WHERE crash_consent IS FALSE;

  FOR trig_rec IN
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND NOT tgisinternal
  LOOP
    EXECUTE format('ALTER TABLE public.profiles ENABLE TRIGGER %I', trig_rec.tgname);
  END LOOP;
END $$;