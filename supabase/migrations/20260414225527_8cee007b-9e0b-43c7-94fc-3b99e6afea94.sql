ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS crash_consent boolean DEFAULT false;

ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS user_id uuid GENERATED ALWAYS AS (author_id) STORED;