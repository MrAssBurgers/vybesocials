ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reported_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.reports ALTER COLUMN post_id DROP NOT NULL;
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_target_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_target_check CHECK (post_id IS NOT NULL OR reported_user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS reports_reported_user_id_idx ON public.reports(reported_user_id);